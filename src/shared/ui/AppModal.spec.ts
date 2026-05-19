import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import AppModal from './AppModal.vue';

// Helpers ----------------------------------------------------------------

function getDialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function getFocusableInDialog(): HTMLElement[] {
  const dialog = getDialog();
  if (!dialog) return [];
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && !el.closest('[hidden]'));
}

// Each test gets a fresh container attached to body so Teleport works
// and focus assertions behave correctly.
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.body.style.overflow = '';
});
afterEach(() => {
  document.body.removeChild(container);
  document.body.style.overflow = '';
});

// Body-overflow -----------------------------------------------------------

describe('body overflow', () => {
  it('sets overflow to hidden when the modal opens', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });
    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    wrapper.unmount();
  });

  it('clears overflow when the modal closes', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });
    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe('');
    wrapper.unmount();
  });

  it('resets overflow on unmount while open', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });
    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does not reset overflow on unmount when closed', async () => {
    // Simulate a different cause setting overflow hidden before the modal unmounts closed
    document.body.style.overflow = 'hidden';
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });
    wrapper.unmount();
    // The modal was closed, so it should NOT touch body overflow
    expect(document.body.style.overflow).toBe('hidden');
    document.body.style.overflow = '';
  });
});

// Focus management --------------------------------------------------------

describe('focus management', () => {
  it('moves focus into the dialog when it opens', async () => {
    const trigger = document.createElement('button');
    container.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    const dialog = getDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
    wrapper.unmount();
  });

  it('restores focus to the trigger element when the modal closes', async () => {
    const trigger = document.createElement('button');
    container.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });

    await wrapper.setProps({ open: true });
    await nextTick();
    await wrapper.setProps({ open: false });
    await nextTick();

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
  });

  it('restores focus to the trigger element on unmount while open', async () => {
    const trigger = document.createElement('button');
    container.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
  });
});

// Focus trap --------------------------------------------------------------

describe('focus trap', () => {
  it('wraps Tab from the last focusable element to the first', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
      slots: {
        footer: '<button id="btn-extra">Extra</button>',
      },
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    const focusable = getFocusableInDialog();
    expect(focusable.length).toBeGreaterThanOrEqual(2);

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    expect(document.activeElement).toBe(last);

    const dialog = getDialog()!;
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
      slots: {
        footer: '<button id="btn-extra">Extra</button>',
      },
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    const focusable = getFocusableInDialog();
    expect(focusable.length).toBeGreaterThanOrEqual(2);

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    first.focus();
    expect(document.activeElement).toBe(first);

    const dialog = getDialog()!;
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(event);

    expect(document.activeElement).toBe(last);
    wrapper.unmount();
  });

  it('does not wrap Tab when focus is NOT on the last focusable element', async () => {
    const wrapper = mount(AppModal, {
      props: { open: false, title: 'Test' },
      attachTo: container,
      slots: {
        footer: '<button id="btn-extra">Extra</button>',
      },
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    const focusable = getFocusableInDialog();
    expect(focusable.length).toBeGreaterThanOrEqual(2);

    const first = focusable[0]!;
    first.focus();

    const dialog = getDialog()!;
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    // Focus should still be on first (not wrapped) because Tab from first → second is browser default
    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });
});

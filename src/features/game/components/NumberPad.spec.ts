import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import NumberPad from './NumberPad.vue';

describe('NumberPad', () => {
  it('emits digit with the right number for each pad key 1-9', async () => {
    const wrapper = mount(NumberPad);
    for (let n = 1; n <= 9; n++) {
      await wrapper.get(`[data-testid="pad-${n}"]`).trigger('click');
    }
    const emits = wrapper.emitted('digit') ?? [];
    expect(emits).toEqual([[1], [2], [3], [4], [5], [6], [7], [8], [9]]);
  });

  it('emits clear when the clear button is clicked', async () => {
    const wrapper = mount(NumberPad);
    await wrapper.get('[data-testid="pad-clear"]').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('emits pencil-toggle and reflects pencilMode in aria-pressed', async () => {
    const wrapper = mount(NumberPad, { props: { pencilMode: false } });
    const pencil = wrapper.get('[data-testid="pad-pencil"]');
    expect(pencil.attributes('aria-pressed')).toBe('false');
    await pencil.trigger('click');
    expect(wrapper.emitted('pencil-toggle')).toHaveLength(1);
    await wrapper.setProps({ pencilMode: true });
    expect(pencil.attributes('aria-pressed')).toBe('true');
  });

  it('disables every key when disabled=true', () => {
    const wrapper = mount(NumberPad, { props: { disabled: true } });
    const buttons = wrapper.findAll('button');
    for (const b of buttons) expect(b.attributes('disabled')).toBeDefined();
  });
});

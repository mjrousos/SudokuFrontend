import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetThemeForTests, useTheme } from '@/shared/composables/useTheme';
import ThemeToggle from './ThemeToggle.vue';

// Minimal matchMedia stub so useTheme initializes cleanly. The toggle
// component test doesn't care about OS preference; it just needs the
// composable to construct without throwing.
function installStubMatchMedia(matches = false): void {
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  (window as unknown as { matchMedia: typeof globalThis.matchMedia }).matchMedia =
    globalThis.matchMedia;
}

describe('ThemeToggle.vue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    installStubMatchMedia(false);
  });

  afterEach(() => {
    _resetThemeForTests();
    vi.unstubAllGlobals();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders the System icon by default and announces "System"', () => {
    const wrapper = mount(ThemeToggle);
    const button = wrapper.get('[data-testid="theme-toggle"]');
    expect(button.attributes('data-theme-preference')).toBe('system');
    expect(button.attributes('aria-label')).toContain('Theme: System');
    expect(button.attributes('aria-label')).toContain('Light');
    expect(wrapper.get('.sr-only').text()).toBe('Theme: System');
    wrapper.unmount();
  });

  it('reflects an existing "dark" preference seeded in localStorage', () => {
    window.localStorage.setItem('sudoku.theme', 'dark');
    const wrapper = mount(ThemeToggle);
    const button = wrapper.get('[data-testid="theme-toggle"]');
    expect(button.attributes('data-theme-preference')).toBe('dark');
    expect(wrapper.get('.sr-only').text()).toBe('Theme: Dark');
    wrapper.unmount();
  });

  it('cycles light → dark → system → light on successive clicks', async () => {
    window.localStorage.setItem('sudoku.theme', 'light');
    const wrapper = mount(ThemeToggle);
    const button = wrapper.get('[data-testid="theme-toggle"]');
    expect(button.attributes('data-theme-preference')).toBe('light');

    await button.trigger('click');
    expect(button.attributes('data-theme-preference')).toBe('dark');
    expect(window.localStorage.getItem('sudoku.theme')).toBe('dark');

    await button.trigger('click');
    expect(button.attributes('data-theme-preference')).toBe('system');
    expect(window.localStorage.getItem('sudoku.theme')).toBe('system');

    await button.trigger('click');
    expect(button.attributes('data-theme-preference')).toBe('light');
    expect(window.localStorage.getItem('sudoku.theme')).toBe('light');

    wrapper.unmount();
  });

  it('applies the dark class to <html> when the user picks Dark', async () => {
    const wrapper = mount(ThemeToggle);
    const button = wrapper.get('[data-testid="theme-toggle"]');
    // system -> light first, then light -> dark
    await button.trigger('click');
    await button.trigger('click');
    expect(useTheme().preference.value).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    wrapper.unmount();
  });
});

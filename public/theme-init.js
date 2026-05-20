/*
 * Pre-mount theme initializer.
 *
 * Runs synchronously from <head> before the Vue app mounts, so the user's
 * chosen theme is applied to <html> before any pixels are painted (no
 * flash of the wrong theme on reload).
 *
 * Must stay framework-free and import-free — it runs in the browser as a
 * plain script. CSP is `script-src 'self'` (no `'unsafe-inline'`, no
 * nonce), which is why this lives in /public and is loaded via
 * <script src="/theme-init.js"> rather than inlined into index.html.
 *
 * Kept in sync with src/shared/composables/useTheme.ts:
 *  - storage key: 'sudoku.theme'
 *  - values: 'light' | 'dark' | 'system' (anything else => 'system')
 *  - applies the `dark` class on <html> and sets style.colorScheme
 */
(function () {
  var STORAGE_KEY = 'sudoku.theme';
  var html = document.documentElement;

  var saved = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw in Safari private mode or if storage is
    // disabled. Fall through to the system default.
  }

  var preference = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';

  var isDark;
  if (preference === 'system') {
    var mql = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    isDark = !!(mql && mql.matches);
  } else {
    isDark = preference === 'dark';
  }

  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  html.style.colorScheme = isDark ? 'dark' : 'light';
})();

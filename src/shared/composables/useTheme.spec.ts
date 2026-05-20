import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetThemeForTests,
  useTheme,
  type ThemePreference,
} from './useTheme';

// ---------------------------------------------------------------------------
// matchMedia stub with controllable `matches` and a captured listener so
// tests can fire synthetic "change" events.
// ---------------------------------------------------------------------------
interface MediaListenerHook {
  setMatches: (next: boolean) => void;
  fireChange: (matches: boolean) => void;
  readonly removeCalls: number;
  isRegistered: () => boolean;
}

function installMatchMedia(initialMatches = false): MediaListenerHook {
  let matches = initialMatches;
  let listeners: Array<(e: { matches: boolean }) => void> = [];
  let removeCalls = 0;
  const mql = {
    media: '(prefers-color-scheme: dark)',
    get matches() {
      return matches;
    },
    addEventListener: (_event: 'change', cb: (e: { matches: boolean }) => void) => {
      listeners.push(cb);
    },
    removeEventListener: (_event: 'change', cb: (e: { matches: boolean }) => void) => {
      removeCalls++;
      listeners = listeners.filter((l) => l !== cb);
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  // happy-dom exposes window as globalThis; also stub on `window`.
  (window as unknown as { matchMedia: typeof globalThis.matchMedia }).matchMedia =
    globalThis.matchMedia;
  return {
    setMatches: (next) => {
      matches = next;
    },
    fireChange: (next) => {
      matches = next;
      for (const cb of [...listeners]) cb({ matches: next });
    },
    get removeCalls() {
      return removeCalls;
    },
    isRegistered: () => listeners.length > 0,
  };
}

function uninstallMatchMedia(): void {
  vi.unstubAllGlobals();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
}

function clearHtml(): void {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
}

function seedStorage(value: ThemePreference | string | null): void {
  window.localStorage.clear();
  if (value !== null) window.localStorage.setItem('sudoku.theme', value);
}

describe('useTheme', () => {
  beforeEach(() => {
    seedStorage(null);
    clearHtml();
  });

  afterEach(() => {
    _resetThemeForTests();
    uninstallMatchMedia();
    clearHtml();
    window.localStorage.clear();
  });

  describe('initialization', () => {
    it('defaults to "system" when nothing is persisted', () => {
      installMatchMedia(false);
      const t = useTheme();
      expect(t.preference.value).toBe('system');
      expect(t.resolved.value).toBe('light');
    });

    it('reads "light" from localStorage', () => {
      installMatchMedia(true); // OS prefers dark, but explicit "light" wins
      seedStorage('light');
      const t = useTheme();
      expect(t.preference.value).toBe('light');
      expect(t.resolved.value).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('reads "dark" from localStorage', () => {
      installMatchMedia(false);
      seedStorage('dark');
      const t = useTheme();
      expect(t.preference.value).toBe('dark');
      expect(t.resolved.value).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('treats a garbage localStorage value as "system"', () => {
      installMatchMedia(true);
      seedStorage('purple');
      const t = useTheme();
      expect(t.preference.value).toBe('system');
      expect(t.resolved.value).toBe('dark'); // because system prefers dark
    });

    it('resolves "system" to "dark" when OS prefers dark', () => {
      installMatchMedia(true);
      const t = useTheme();
      expect(t.preference.value).toBe('system');
      expect(t.resolved.value).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('resolves "system" to "light" when window.matchMedia is missing', () => {
      // Intentionally do not install matchMedia.
      uninstallMatchMedia();
      const t = useTheme();
      expect(t.preference.value).toBe('system');
      expect(t.resolved.value).toBe('light');
    });

    it('returns the same singleton on every call', () => {
      installMatchMedia(false);
      const a = useTheme();
      const b = useTheme();
      expect(a).toBe(b);
      expect(a.preference).toBe(b.preference);
    });

    it('falls back to "system" when localStorage.getItem throws', () => {
      installMatchMedia(false);
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      try {
        const t = useTheme();
        expect(t.preference.value).toBe('system');
      } finally {
        getItem.mockRestore();
      }
    });
  });

  describe('setPreference', () => {
    it('persists to localStorage and applies the resolved theme', () => {
      installMatchMedia(false);
      const t = useTheme();
      t.setPreference('dark');
      expect(t.preference.value).toBe('dark');
      expect(window.localStorage.getItem('sudoku.theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('switching dark → light removes the class and updates colorScheme', () => {
      installMatchMedia(false);
      seedStorage('dark');
      const t = useTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      t.setPreference('light');
      expect(t.resolved.value).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('switching back to "system" picks up the live OS preference', () => {
      const hook = installMatchMedia(true); // OS prefers dark
      seedStorage('light');
      const t = useTheme();
      expect(t.resolved.value).toBe('light');
      t.setPreference('system');
      expect(t.resolved.value).toBe('dark');
      // And subsequent OS change keeps it in sync.
      hook.fireChange(false);
      expect(t.resolved.value).toBe('light');
    });

    it('ignores invalid values', () => {
      installMatchMedia(false);
      const t = useTheme();
      const before = t.preference.value;
      t.setPreference('blue' as unknown as ThemePreference);
      expect(t.preference.value).toBe(before);
    });

    it('still updates in-memory state when localStorage.setItem throws', () => {
      installMatchMedia(false);
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      try {
        const t = useTheme();
        t.setPreference('dark');
        expect(t.preference.value).toBe('dark');
        expect(t.resolved.value).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      } finally {
        setItem.mockRestore();
      }
    });
  });

  describe('cyclePreference', () => {
    it('cycles light → dark → system → light', () => {
      installMatchMedia(false);
      seedStorage('light');
      const t = useTheme();
      expect(t.preference.value).toBe('light');
      t.cyclePreference();
      expect(t.preference.value).toBe('dark');
      t.cyclePreference();
      expect(t.preference.value).toBe('system');
      t.cyclePreference();
      expect(t.preference.value).toBe('light');
    });
  });

  describe('OS preference tracking', () => {
    it('reacts to a "change" event when preference is "system"', () => {
      const hook = installMatchMedia(false);
      const t = useTheme();
      expect(t.resolved.value).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      hook.fireChange(true);
      expect(t.resolved.value).toBe('dark');
      // The watcher with `flush: 'sync'` keeps the DOM in lockstep so a
      // user in 'system' mode sees the page repaint when the OS flips.
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('does NOT affect resolved when preference is explicit "light"', () => {
      const hook = installMatchMedia(false);
      seedStorage('light');
      const t = useTheme();
      hook.fireChange(true);
      expect(t.resolved.value).toBe('light');
    });

    it('does NOT affect resolved when preference is explicit "dark"', () => {
      const hook = installMatchMedia(true);
      seedStorage('dark');
      const t = useTheme();
      hook.fireChange(false);
      expect(t.resolved.value).toBe('dark');
    });

    it('falls back to legacy addListener when addEventListener is absent', () => {
      let legacyListener: ((e: { matches: boolean }) => void) | null = null;
      let matches = false;
      const mql = {
        get matches() {
          return matches;
        },
        addListener: (cb: (e: { matches: boolean }) => void) => {
          legacyListener = cb;
        },
        removeListener: (_cb: (e: { matches: boolean }) => void) => {
          legacyListener = null;
        },
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mql),
      );
      (window as unknown as { matchMedia: typeof globalThis.matchMedia }).matchMedia =
        globalThis.matchMedia;

      const t = useTheme();
      expect(legacyListener).not.toBeNull();
      matches = true;
      legacyListener?.({ matches: true });
      expect(t.resolved.value).toBe('dark');
    });
  });

  describe('_resetThemeForTests', () => {
    it('detaches the matchMedia listener', () => {
      const hook = installMatchMedia(false);
      useTheme();
      expect(hook.isRegistered()).toBe(true);
      _resetThemeForTests();
      expect(hook.isRegistered()).toBe(false);
      expect(hook.removeCalls).toBeGreaterThan(0);
    });

    it('drops the singleton so the next useTheme() re-reads storage', () => {
      installMatchMedia(false);
      const a = useTheme();
      a.setPreference('dark');
      _resetThemeForTests();
      // Pre-flight: simulate a different persisted value.
      seedStorage('light');
      const b = useTheme();
      expect(a).not.toBe(b);
      expect(b.preference.value).toBe('light');
    });
  });
});

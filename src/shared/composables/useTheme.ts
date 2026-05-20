/**
 * Theme preference composable.
 *
 * Owns the canonical theme state for the app: a tri-state preference
 * (`light` | `dark` | `system`), the resolved theme actually applied to
 * the page, and the side effects that keep `<html>`, `localStorage`, and
 * the OS-preference listener in sync.
 *
 * Module-level singleton: every `useTheme()` call returns the same
 * reactive refs and the same handlers. Initialization is idempotent and
 * lazy — calling `useTheme()` from `main.ts` is sufficient to install the
 * OS listener for the lifetime of the app.
 *
 * The companion `public/theme-init.js` script runs before this module
 * loads to apply the saved preference synchronously and avoid a flash of
 * the wrong theme. The two MUST agree on:
 *   - the storage key (`sudoku.theme`)
 *   - the allowed values (`light` | `dark` | `system`)
 *   - what "system" means (`prefers-color-scheme: dark`)
 *   - the side effect (toggle `dark` class on `<html>` + set
 *     `style.colorScheme`)
 */
import { computed, readonly, ref, watch, type ComputedRef, type Ref, type WatchStopHandle } from 'vue';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'sudoku.theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';
const CYCLE: readonly ThemePreference[] = ['light', 'dark', 'system'] as const;

interface ThemeState {
  // Refs are exposed as read-only so the only supported way to mutate
  // theme state from outside this module is via `setPreference` /
  // `cyclePreference`, which keep `localStorage` and the resolved DOM
  // class in sync. Direct `preference.value = …` writes would bypass
  // persistence and the OS re-read inside `setPreference`.
  preference: Readonly<Ref<ThemePreference>>;
  systemPrefersDark: Readonly<Ref<boolean>>;
  resolved: ComputedRef<ResolvedTheme>;
  setPreference: (next: ThemePreference) => void;
  cyclePreference: () => void;
}

let state: ThemeState | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let stopWatch: WatchStopHandle | null = null;

function readPersistedPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // localStorage may throw (Safari private mode, disabled storage).
    // Fall through to the default.
  }
  return 'system';
}

function persistPreference(value: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Best-effort persistence; in-memory state still works for the
    // current session.
  }
}

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MEDIA_QUERY).matches;
}

function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  html.style.colorScheme = theme;
}

function createState(): ThemeState {
  const preference = ref<ThemePreference>(readPersistedPreference());
  const systemPrefersDark = ref<boolean>(readSystemPrefersDark());

  const resolved = computed<ResolvedTheme>(() =>
    preference.value === 'system'
      ? systemPrefersDark.value
        ? 'dark'
        : 'light'
      : preference.value,
  );

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia(MEDIA_QUERY);
    mediaListener = (event: MediaQueryListEvent) => {
      systemPrefersDark.value = event.matches;
    };
    // Use addEventListener where available; addListener is the legacy
    // Safari API kept for older browsers.
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', mediaListener);
    } else if (typeof (mediaQuery as MediaQueryList).addListener === 'function') {
      (mediaQuery as MediaQueryList).addListener(mediaListener);
    }
  }

  function setPreference(next: ThemePreference): void {
    if (next !== 'light' && next !== 'dark' && next !== 'system') return;
    preference.value = next;
    persistPreference(next);
    // Re-read in case the OS preference changed while we were in an
    // explicit mode (we still listen, but the computed only reflects it
    // when preference === 'system').
    systemPrefersDark.value = readSystemPrefersDark();
  }

  function cyclePreference(): void {
    const index = CYCLE.indexOf(preference.value);
    const nextIndex = (index + 1) % CYCLE.length;
    setPreference(CYCLE[nextIndex] ?? 'system');
  }

  // Keep the DOM in sync with whatever `resolved` reports — this covers
  // explicit changes via setPreference AND OS changes while in 'system'
  // mode. Fires synchronously on flush so toggle UX feels instant.
  stopWatch = watch(
    resolved,
    (next) => {
      applyResolvedTheme(next);
    },
    { flush: 'sync' },
  );

  // Apply once on initialization so the resolved theme is always in sync,
  // even if the pre-mount script didn't run (tests, future use-cases).
  applyResolvedTheme(resolved.value);

  return {
    preference: readonly(preference),
    systemPrefersDark: readonly(systemPrefersDark),
    resolved,
    setPreference,
    cyclePreference,
  };
}

export function useTheme(): ThemeState {
  if (!state) {
    state = createState();
  }
  return state;
}

/**
 * Test-only escape hatch: drops the module-level singleton and detaches
 * the matchMedia listener so each spec starts from a clean slate.
 * `tests/unit/setup.ts` resets Pinia and the HTTP client between tests
 * but not arbitrary module state, so theme specs call this in
 * `beforeEach`.
 */
export function _resetThemeForTests(): void {
  if (stopWatch) {
    stopWatch();
    stopWatch = null;
  }
  if (mediaQuery && mediaListener) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaListener);
    } else if (typeof (mediaQuery as MediaQueryList).removeListener === 'function') {
      (mediaQuery as MediaQueryList).removeListener(mediaListener);
    }
  }
  mediaQuery = null;
  mediaListener = null;
  state = null;
}

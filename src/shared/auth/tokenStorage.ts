/**
 * Persistent storage for the rotating refresh token. The access token is
 * deliberately never persisted — it lives in Pinia state and dies with the
 * tab. The refresh token persists in localStorage so users don't get logged
 * out on a reload; we accept the XSS exposure and mitigate via CSP, no
 * `v-html` on user content, and dependency audits.
 */

const STORAGE_KEY = 'sudoku.refreshToken.v1';

export interface PersistedRefresh {
  refreshToken: string;
  refreshTokenExpiresAt: string; // ISO datetime
  userId: string;
}

interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeStorage(): KVStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Touch it once to detect Safari Private Mode / disabled storage.
    const probe = '__sudoku_probe__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadPersistedRefresh(storage: KVStorage | null = safeStorage()): PersistedRefresh | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRefresh>;
    if (
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.refreshTokenExpiresAt === 'string' &&
      typeof parsed.userId === 'string'
    ) {
      return parsed as PersistedRefresh;
    }
    storage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function savePersistedRefresh(
  value: PersistedRefresh,
  storage: KVStorage | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage full / disabled — silently degrade; the in-memory token still works.
  }
}

export function clearPersistedRefresh(storage: KVStorage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export const __TEST_ONLY__ = { STORAGE_KEY };

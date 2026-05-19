import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPersistedRefresh,
  loadPersistedRefresh,
  savePersistedRefresh,
  __TEST_ONLY__,
} from '@/shared/auth/tokenStorage';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('tokenStorage', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('round-trips a valid record', () => {
    savePersistedRefresh(
      {
        refreshToken: 'rt-1',
        refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
        userId: 'user-1',
      },
      storage,
    );
    const loaded = loadPersistedRefresh(storage);
    expect(loaded).toEqual({
      refreshToken: 'rt-1',
      refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
      userId: 'user-1',
    });
  });

  it('returns null when nothing is persisted', () => {
    expect(loadPersistedRefresh(storage)).toBeNull();
  });

  it('discards an invalid stored payload and evicts it', () => {
    storage.setItem(__TEST_ONLY__.STORAGE_KEY, JSON.stringify({ refreshToken: 'rt' }));
    expect(loadPersistedRefresh(storage)).toBeNull();
    expect(storage.getItem(__TEST_ONLY__.STORAGE_KEY)).toBeNull();
  });

  it('clear removes the entry', () => {
    savePersistedRefresh(
      { refreshToken: 'rt', refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z', userId: 'u' },
      storage,
    );
    clearPersistedRefresh(storage);
    expect(loadPersistedRefresh(storage)).toBeNull();
  });

  it('tolerates a missing storage (returns null / no-op)', () => {
    expect(loadPersistedRefresh(null)).toBeNull();
    expect(() =>
      savePersistedRefresh(
        { refreshToken: 'rt', refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z', userId: 'u' },
        null,
      ),
    ).not.toThrow();
    expect(() => clearPersistedRefresh(null)).not.toThrow();
  });
});

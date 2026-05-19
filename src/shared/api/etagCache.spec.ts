import { describe, it, expect, beforeEach } from 'vitest';

import { ETagCache } from '@/shared/api/etagCache';

describe('ETagCache', () => {
  let cache: ETagCache;
  beforeEach(() => {
    cache = new ETagCache();
  });

  it('stores and retrieves an entry under the same identity', () => {
    cache.set('/users/me', '"abc"', { name: 'alice' }, 'user-1');
    const hit = cache.get('/users/me', 'user-1');
    expect(hit?.etag).toBe('"abc"');
    expect(hit?.body).toEqual({ name: 'alice' });
  });

  it('returns undefined when the identity differs and evicts the entry', () => {
    cache.set('/users/me', '"abc"', { name: 'alice' }, 'user-1');
    const miss = cache.get('/users/me', 'user-2');
    expect(miss).toBeUndefined();
    // The mismatched entry should have been evicted to prevent later identity-1 hits
    // serving an entry that has gone through a logout/login cycle.
    expect(cache.size()).toBe(0);
  });

  it('returns undefined for an unknown URL', () => {
    expect(cache.get('/leaderboards/Easy', 'user-1')).toBeUndefined();
  });

  it('clears only entries for other identities when asked', () => {
    cache.set('/users/me', '"a"', {}, 'user-1');
    cache.set('/leaderboards/Easy', '"b"', {}, null);
    cache.clearForOtherIdentities('user-1');
    expect(cache.get('/users/me', 'user-1')).toBeDefined();
    expect(cache.get('/leaderboards/Easy', null)).toBeUndefined();
  });

  it('clear() empties everything', () => {
    cache.set('/users/me', '"a"', {}, 'user-1');
    cache.set('/leaderboards/Easy', '"b"', {}, 'user-1');
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

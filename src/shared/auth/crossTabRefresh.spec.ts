import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAuthBroadcast,
  withRefreshLock,
  AUTH_BROADCAST_CHANNEL,
} from '@/shared/auth/crossTabRefresh';

describe('createAuthBroadcast', () => {
  let openChannels: { close: () => void }[] = [];
  afterEach(() => {
    for (const c of openChannels) c.close();
    openChannels = [];
  });

  it('round-trips messages across channels with the same name', async () => {
    // Two wrappers on the same channel name behave like two browser tabs.
    const name = `${AUTH_BROADCAST_CHANNEL}.roundtrip.${Math.random()}`;
    const c1 = createAuthBroadcast(name);
    const c2 = createAuthBroadcast(name);
    openChannels.push(c1, c2);
    const received: unknown[] = [];
    c2.subscribe((m) => received.push(m));
    c1.post({ type: 'logged-out', reason: 'manual' });
    // BroadcastChannel delivers asynchronously; yield a few times.
    await new Promise((r) => setTimeout(r, 5));
    expect(received).toEqual([{ type: 'logged-out', reason: 'manual' }]);
  });

  it('subscribe returns an unsubscribe function', async () => {
    const name = `${AUTH_BROADCAST_CHANNEL}.unsub.${Math.random()}`;
    const c1 = createAuthBroadcast(name);
    const c2 = createAuthBroadcast(name);
    openChannels.push(c1, c2);
    const calls: unknown[] = [];
    const off = c2.subscribe((m) => calls.push(m));
    off();
    c1.post({ type: 'logged-out', reason: 'manual' });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([]);
  });
});

describe('withRefreshLock', () => {
  it('serializes concurrent tasks (Web Locks present)', async () => {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      // happy-dom does not implement Web Locks — fallback path is exercised below.
      return;
    }
    const events: string[] = [];
    const a = withRefreshLock(async () => {
      events.push('a-start');
      await new Promise((r) => setTimeout(r, 30));
      events.push('a-end');
      return 'a';
    });
    const b = withRefreshLock(async () => {
      events.push('b-start');
      events.push('b-end');
      return 'b';
    });
    await Promise.all([a, b]);
    // a must fully complete before b starts (exclusive lock).
    expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('falls back to localStorage mutex when Web Locks are missing', async () => {
    const originalLocks = (navigator as unknown as { locks?: unknown }).locks;
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    try {
      const events: string[] = [];
      const a = withRefreshLock(async () => {
        events.push('a-start');
        await new Promise((r) => setTimeout(r, 60));
        events.push('a-end');
        return 'a';
      });
      // Give 'a' the mutex first.
      await new Promise((r) => setTimeout(r, 0));
      const b = withRefreshLock(async () => {
        events.push('b-start');
        events.push('b-end');
        return 'b';
      });
      await Promise.all([a, b]);
      expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
    } finally {
      Object.defineProperty(navigator, 'locks', { value: originalLocks, configurable: true });
    }
  });

  it('propagates the task result', async () => {
    const result = await withRefreshLock(async () => 'hello');
    expect(result).toBe('hello');
  });

  it('propagates errors and releases the lock', async () => {
    await expect(
      withRefreshLock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // A subsequent call still succeeds (lock was released).
    const r = await withRefreshLock(async () => 'ok');
    expect(r).toBe('ok');
  });

  it('localStorage fallback: only one task runs at a time (no TOCTOU race)', async () => {
    // Simulate environment with no navigator.locks.
    vi.stubGlobal('navigator', { ...navigator, locks: undefined });
    try {
      let concurrency = 0;
      let maxConcurrency = 0;

      async function task() {
        concurrency++;
        if (concurrency > maxConcurrency) maxConcurrency = concurrency;
        // Hold the lock for a bit so the second caller has a chance to race.
        await new Promise((r) => setTimeout(r, 80));
        concurrency--;
        return concurrency;
      }

      // Launch two callers roughly simultaneously.
      const [, ] = await Promise.all([withRefreshLock(task), withRefreshLock(task)]);

      // Concurrency must never have exceeded 1 — the mutex worked.
      expect(maxConcurrency).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('without BroadcastChannel, returns a no-op broadcast object', () => {
    const originalBC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
    try {
      const noop = createAuthBroadcast('whatever');
      const spy = vi.fn();
      const off = noop.subscribe(spy);
      noop.post({ type: 'logged-out', reason: 'manual' });
      off();
      noop.close();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = originalBC;
    }
  });
});

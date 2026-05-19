import { describe, expect, it, vi } from 'vitest';

import { createMoveQueue } from './moveQueue';

describe('createMoveQueue', () => {
  it('runs tasks in strict FIFO order even when later tasks finish faster', async () => {
    const q = createMoveQueue();
    const events: string[] = [];

    const a = q.enqueue(async () => {
      events.push('a-start');
      await new Promise((r) => setTimeout(r, 30));
      events.push('a-end');
      return 'a';
    });
    const b = q.enqueue(async () => {
      events.push('b-start');
      events.push('b-end');
      return 'b';
    });
    const c = q.enqueue(async () => {
      events.push('c-start');
      await new Promise((r) => setTimeout(r, 5));
      events.push('c-end');
      return 'c';
    });

    const [va, vb, vc] = await Promise.all([a, b, c]);
    expect(va).toBe('a');
    expect(vb).toBe('b');
    expect(vc).toBe('c');
    expect(events).toEqual([
      'a-start',
      'a-end',
      'b-start',
      'b-end',
      'c-start',
      'c-end',
    ]);
  });

  it('propagates errors but keeps draining subsequent tasks', async () => {
    const q = createMoveQueue();
    const ran: string[] = [];

    const a = q.enqueue<string>(async () => {
      ran.push('a');
      throw new Error('boom');
    });
    const b = q.enqueue<string>(async () => {
      ran.push('b');
      return 'ok';
    });

    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('ok');
    expect(ran).toEqual(['a', 'b']);
  });

  it('busy is true while pending or running, false when fully drained', async () => {
    const q = createMoveQueue();
    expect(q.busy).toBe(false);

    let resolveTask!: () => void;
    const task = new Promise<void>((r) => (resolveTask = r));
    const p = q.enqueue(async () => task);
    expect(q.busy).toBe(true);
    resolveTask();
    await p;
    expect(q.busy).toBe(false);
  });

  it('clear() rejects pending tasks but lets the running task finish', async () => {
    const q = createMoveQueue();
    const ran: string[] = [];

    let resolveA!: (v: string) => void;
    const a = q.enqueue<string>(
      () => new Promise<string>((r) => (resolveA = r)),
    );
    const b = q.enqueue<string>(async () => {
      ran.push('b');
      return 'b';
    });

    q.clear(new Error('user navigated away'));

    resolveA('a');
    await expect(a).resolves.toBe('a');
    await expect(b).rejects.toThrow('user navigated away');
    expect(ran).not.toContain('b');
  });

  it('serializes concurrent enqueues from sync code', async () => {
    const q = createMoveQueue();
    const order: number[] = [];
    const taskFor = (n: number) => async () => {
      order.push(n);
      return n;
    };

    const promises = [1, 2, 3, 4, 5].map((n) => q.enqueue(taskFor(n)));
    const results = await Promise.all(promises);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('a slow task does not get skipped by a fast one queued after it', async () => {
    const q = createMoveQueue();
    const completionOrder: string[] = [];

    const slow = q
      .enqueue(async () => {
        await new Promise((r) => setTimeout(r, 20));
        completionOrder.push('slow');
      })
      .then(() => 'slow');

    const fast = q
      .enqueue(async () => {
        completionOrder.push('fast');
      })
      .then(() => 'fast');

    const winners = await Promise.all([slow, fast]);
    expect(winners).toEqual(['slow', 'fast']);
    expect(completionOrder).toEqual(['slow', 'fast']);
  });

  it('does not call subsequent tasks until the previous resolves', async () => {
    const q = createMoveQueue();
    const calls: string[] = [];
    const second = vi.fn(async () => {
      calls.push('second');
    });

    let resolveFirst!: () => void;
    const firstPromise = q.enqueue(
      () =>
        new Promise<void>((r) => {
          calls.push('first');
          resolveFirst = r;
        }),
    );
    q.enqueue(second);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['first']);
    expect(second).not.toHaveBeenCalled();

    resolveFirst();
    await firstPromise;
    // Let drain pick up the next task.
    await new Promise((r) => setTimeout(r, 0));
    expect(second).toHaveBeenCalledOnce();
    expect(calls).toEqual(['first', 'second']);
  });
});

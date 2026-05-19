// Per-game serialized move queue.
//
// The backend's POST /games/{id}/moves uses `moveNumber` as a strictly
// monotonic counter (the server's `nextMoveNumber`). If two POSTs race, the
// loser gets 409 ("stale move"). Even when the user types fast we MUST send
// one POST at a time per game, and we MUST refetch the canonical state on a
// 409 so the next move uses the right number.
//
// The queue is intentionally generic: it just runs `() => Promise<T>` tasks
// in strict FIFO order. The store wraps each move into one of these tasks
// and reconciles the local board with the server response after each one.

export interface MoveQueue {
  /** Enqueue a task; resolves with its return value or rejects with its error. */
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  /** Returns true if the queue currently has work in flight or pending. */
  readonly busy: boolean;
  /** Cancels all pending (not-yet-started) tasks with a rejection. */
  clear(reason?: Error): void;
}

export function createMoveQueue(): MoveQueue {
  type Pending = {
    run: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  };

  const pending: Pending[] = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (pending.length > 0) {
        const next = pending.shift()!;
        try {
          const value = await next.run();
          next.resolve(value);
        } catch (err) {
          next.reject(err);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push({
          run: task as () => Promise<unknown>,
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        void drain();
      });
    },
    get busy(): boolean {
      return running || pending.length > 0;
    },
    clear(reason?: Error): void {
      const err = reason ?? new Error('Move queue cleared.');
      while (pending.length > 0) {
        const p = pending.shift()!;
        p.reject(err);
      }
    },
  };
}

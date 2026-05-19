/**
 * Cross-tab coordination for refresh-token rotation.
 *
 * Why this exists: the access token lives in memory per tab, but the
 * rotating refresh token is shared in localStorage. If two tabs receive
 * 401s at the same time and both call POST /auth/refresh, one wins and
 * the other gets a 401 with title=token_reused — invalidating the entire
 * session for the user. We avoid that by serializing the refresh through
 * a cross-tab lock, and broadcasting the resulting tokens (or logout
 * signal) to every tab so they all stay in sync.
 *
 * Two transport pieces:
 *  - withRefreshLock(): a single-writer lock around the refresh call.
 *    Uses navigator.locks where available, falling back to a timestamped
 *    localStorage mutex for ancient browsers / tests.
 *  - createAuthBroadcast(): a thin BroadcastChannel wrapper so every tab
 *    learns about token updates and logouts without polling.
 */

const LOCK_NAME = 'sudoku-auth-refresh';
const FALLBACK_KEY = 'sudoku.authLock.v1';
const FALLBACK_TTL_MS = 10_000; // assume a tab crashed after 10s

export const AUTH_BROADCAST_CHANNEL = 'sudoku-auth';

export interface TokensUpdatedMessage {
  type: 'tokens-updated';
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  userId: string;
  displayName: string;
}

export interface LoggedOutMessage {
  type: 'logged-out';
  reason: 'manual' | 'session_expired' | 'token_reused';
}

export type AuthBroadcastMessage = TokensUpdatedMessage | LoggedOutMessage;

export interface AuthBroadcast {
  post(message: AuthBroadcastMessage): void;
  subscribe(handler: (message: AuthBroadcastMessage) => void): () => void;
  close(): void;
}

export function createAuthBroadcast(name = AUTH_BROADCAST_CHANNEL): AuthBroadcast {
  if (typeof BroadcastChannel === 'undefined') {
    // Tests in Node without happy-dom may not have BroadcastChannel.
    return {
      post: () => {},
      subscribe: () => () => {},
      close: () => {},
    };
  }
  const channel = new BroadcastChannel(name);
  const handlers = new Set<(message: AuthBroadcastMessage) => void>();
  channel.onmessage = (event) => {
    for (const handler of handlers) handler(event.data as AuthBroadcastMessage);
  };
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close: () => {
      handlers.clear();
      channel.close();
    },
  };
}

function generateOwner(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface LocksLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' | 'shared' },
    callback: () => Promise<T>,
  ): Promise<T>;
}

function getLocksApi(): LocksLike | null {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks as unknown as LocksLike;
  }
  return null;
}

/**
 * Run `task` inside a cross-tab exclusive lock named `sudoku-auth-refresh`.
 * Only one tab in the browser will run `task` at a time; the rest queue
 * behind it. After the lock releases, queued tasks each see the (now
 * updated) tokens and typically short-circuit because the refresh has
 * already happened.
 */
export async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = getLocksApi();
  if (locks) {
    return locks.request(LOCK_NAME, { mode: 'exclusive' }, task);
  }
  // localStorage fallback: spin until the slot is empty or stale.
  if (typeof localStorage === 'undefined') {
    // No coordination available at all (server-side or strict CSP); just run.
    return task();
  }
  const owner = generateOwner();
  const start = Date.now();
  while (true) {
    // Check whether the slot is unoccupied or stale.
    const existing = localStorage.getItem(FALLBACK_KEY);
    let occupied = false;
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { owner: string; ts: number };
        occupied = Date.now() - parsed.ts <= FALLBACK_TTL_MS;
      } catch {
        // Malformed entry — treat as unoccupied.
      }
    }

    if (!occupied) {
      // Attempt to claim the slot.
      localStorage.setItem(FALLBACK_KEY, JSON.stringify({ owner, ts: Date.now() }));
      // Wait briefly so any concurrent claimant can also write; the last
      // writer wins in localStorage — after the wait, only one owner survives.
      await new Promise((r) => setTimeout(r, 50));

      const claimed = localStorage.getItem(FALLBACK_KEY);
      if (claimed) {
        // Parse separately so JSON errors don't swallow task errors.
        let ownsLock = false;
        try {
          const parsed = JSON.parse(claimed) as { owner: string; ts: number };
          ownsLock = parsed.owner === owner;
        } catch {
          // Malformed entry — retry.
        }

        if (ownsLock) {
          // We own the lock — run the task.
          try {
            return await task();
          } finally {
            // Release only if we still own the slot (don't clear another
            // tab's claim if our task outlasted the TTL).
            const current = localStorage.getItem(FALLBACK_KEY);
            if (current) {
              try {
                const c = JSON.parse(current) as { owner: string };
                if (c.owner === owner) localStorage.removeItem(FALLBACK_KEY);
              } catch {
                /* ignore malformed entry */
              }
            }
          }
        }
        // Someone else won — fall through to retry loop.
      }
    }

    if (Date.now() - start > FALLBACK_TTL_MS * 2) {
      // Give up coordinating and just run; better than hanging forever.
      return task();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

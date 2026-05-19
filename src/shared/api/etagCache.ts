/**
 * Auth-scoped ETag cache for cacheable GET endpoints (`/users`, `/leaderboards`).
 *
 * Each entry stores the ETag, the original response body, and the auth
 * identity that produced it. Lookups by URL also require the current auth
 * identity to match, so a logged-out browser can never serve another user's
 * cached body — even if the user IDs reuse URLs across sessions.
 *
 * The cache is intentionally in-memory only. We don't want stale per-user
 * payloads surviving a page reload across account switches.
 */

interface CacheEntry<T = unknown> {
  etag: string;
  body: T;
  authIdentity: AuthIdentity;
}

export type AuthIdentity = string | null;

export class ETagCache {
  private readonly entries = new Map<string, CacheEntry>();

  /**
   * Read a cached entry for the given URL, but only if the current auth
   * identity matches what was used to populate it. Returns `undefined` on
   * miss or identity mismatch (and evicts the mismatched entry).
   */
  get<T = unknown>(url: string, currentIdentity: AuthIdentity): CacheEntry<T> | undefined {
    const entry = this.entries.get(url) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.authIdentity !== currentIdentity) {
      this.entries.delete(url);
      return undefined;
    }
    return entry;
  }

  set<T = unknown>(url: string, etag: string, body: T, identity: AuthIdentity): void {
    this.entries.set(url, { etag, body, authIdentity: identity });
  }

  /** Evict every entry that does not belong to `keepIdentity`. */
  clearForOtherIdentities(keepIdentity: AuthIdentity): void {
    for (const [url, entry] of this.entries) {
      if (entry.authIdentity !== keepIdentity) {
        this.entries.delete(url);
      }
    }
  }

  /** Drop the entire cache (login, logout, token_reused). */
  clear(): void {
    this.entries.clear();
  }

  /** Test helper: snapshot the current entries. */
  size(): number {
    return this.entries.size;
  }
}

// A single shared instance keeps the wiring simple — consumers can also
// construct their own for testing.
export const etagCache = new ETagCache();

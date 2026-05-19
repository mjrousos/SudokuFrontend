import { v4 as uuidv4 } from 'uuid';

import { API_V1 } from '@/shared/config';
import { ApiError, parseApiError } from './problemDetails';
import { etagCache, type AuthIdentity, type ETagCache } from './etagCache';

/**
 * Interface the HTTP client uses to talk to the auth store. We define a
 * minimal shape here (instead of importing the store) so this module
 * stays decoupled from Pinia and is straightforward to unit-test with
 * MSW + a hand-rolled fake auth provider.
 */
export interface AuthProvider {
  /** Current access token, or null if unauthenticated. */
  getAccessToken(): string | null;
  /** Stable identifier (e.g., userId) for cache scoping. Null when anonymous. */
  getAuthIdentity(): AuthIdentity;
  /**
   * Refresh the access token using the persisted refresh token. Must be
   * single-flight per browser; cross-tab coordination is handled inside
   * the store. Returns the new access token, or null if the refresh failed
   * and the caller should give up.
   */
  refresh(): Promise<string | null>;
  /** Called when 401 is unrecoverable (token_reused, no refresh token, etc.). */
  forceLogout(reason: 'session_expired' | 'token_reused'): void;
}

export interface HttpClientOptions {
  baseUrl?: string;
  authProvider: AuthProvider;
  cache?: ETagCache;
  fetchImpl?: typeof fetch;
  /** Visible for tests. */
  uuid?: () => string;
}

export interface RequestOptions<TBody = unknown> {
  /** Suppresses the Authorization header even when an access token is present. */
  anonymous?: boolean;
  /** Skip refresh-on-401 retry — used internally by the auth flow itself. */
  noRefresh?: boolean;
  /** JSON body. */
  body?: TBody;
  /** Extra headers to merge onto the request. */
  headers?: Record<string, string>;
  /** Idempotency-Key override. The default for POST/PUT/DELETE is a fresh UUID. */
  idempotencyKey?: string | null;
  /** Cancellation. */
  signal?: AbortSignal;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isCacheable(method: HttpMethod, path: string): boolean {
  if (method !== 'GET') return false;
  return path.startsWith('/users') || path.startsWith('/leaderboards');
}

interface RawError extends Error {
  status?: number;
  title?: string;
}

export interface HttpClient {
  request<TResponse, TBody = unknown>(
    method: HttpMethod,
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<TResponse>;
  get<TResponse>(path: string, options?: RequestOptions): Promise<TResponse>;
  post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ): Promise<TResponse>;
  put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ): Promise<TResponse>;
  delete<TResponse>(path: string, options?: RequestOptions): Promise<TResponse>;
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const baseUrl = (opts.baseUrl ?? API_V1).replace(/\/+$/, '');
  const cache = opts.cache ?? etagCache;
  const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  const auth = opts.authProvider;
  const newKey = opts.uuid ?? uuidv4;

  async function request<TResponse, TBody = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions<TBody> = {},
  ): Promise<TResponse> {
    if (!path.startsWith('/')) {
      throw new Error(`HTTP path must start with "/", got "${path}"`);
    }
    const url = `${baseUrl}${path}`;

    // Pre-compute a stable Idempotency-Key so a refresh-then-retry reuses it.
    const idempotencyKey = computeIdempotencyKey(method, options, newKey);

    return doFetch<TResponse, TBody>(method, path, url, options, idempotencyKey, /*retried*/ false);
  }

  async function doFetch<TResponse, TBody>(
    method: HttpMethod,
    path: string,
    url: string,
    options: RequestOptions<TBody>,
    idempotencyKey: string | null,
    retried: boolean,
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    // Auth header
    if (!options.anonymous) {
      const token = auth.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    // Idempotency-Key for mutating requests
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    // ETag / If-None-Match
    const identity = auth.getAuthIdentity();
    let cached: { etag: string; body: unknown } | undefined;
    if (isCacheable(method, path)) {
      cached = cache.get(url, identity);
      if (cached) {
        headers['If-None-Match'] = cached.etag;
      }
    }

    // JSON body
    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: options.signal ?? null,
        credentials: 'omit',
      });
    } catch (err) {
      if ((err as RawError).name === 'AbortError') throw err;
      const wrapped: RawError = new Error('Network error: ' + ((err as Error).message ?? 'unknown'));
      wrapped.name = 'NetworkError';
      throw wrapped;
    }

    // 304 — serve from cache
    if (response.status === 304 && cached) {
      return cached.body as TResponse;
    }

    // 401 — attempt single-flight refresh + retry (once)
    if (
      response.status === 401 &&
      !retried &&
      !options.noRefresh
    ) {
      const newToken = await auth.refresh();
      if (newToken) {
        return doFetch<TResponse, TBody>(method, path, url, options, idempotencyKey, true);
      }
      // refresh() already handled forceLogout — fall through to throwing the 401.
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    // ETag caching: store on success
    const etag = response.headers.get('etag');
    let parsed: TResponse;
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      parsed = undefined as unknown as TResponse;
    } else {
      const text = await response.text();
      if (text.length === 0) {
        parsed = undefined as unknown as TResponse;
      } else {
        try {
          parsed = JSON.parse(text) as TResponse;
        } catch (err) {
          throw new ApiError({
            status: response.status,
            title: 'invalid_json',
            detail: 'Server returned a non-JSON success body.',
            cause: err,
          });
        }
      }
    }
    if (etag && isCacheable(method, path)) {
      cache.set(url, etag, parsed, identity);
    }
    return parsed;
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...(options ?? {}), body }),
    put: (path, body, options) => request('PUT', path, { ...(options ?? {}), body }),
    delete: (path, options) => request('DELETE', path, options),
  };
}

function computeIdempotencyKey<TBody>(
  method: HttpMethod,
  options: RequestOptions<TBody>,
  generator: () => string,
): string | null {
  if (!MUTATING_METHODS.has(method)) return null;
  if (options.idempotencyKey === null) return null; // explicit opt-out
  if (typeof options.idempotencyKey === 'string') return options.idempotencyKey;
  return generator();
}

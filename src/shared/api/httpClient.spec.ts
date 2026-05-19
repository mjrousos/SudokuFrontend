import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { ETagCache } from '@/shared/api/etagCache';
import { createHttpClient, type AuthProvider } from '@/shared/api/httpClient';
import { ApiError } from '@/shared/api/problemDetails';

const API = 'http://api.test/api/v1';

interface FakeAuth extends AuthProvider {
  setAccessToken(t: string | null): void;
  setIdentity(id: string | null): void;
  refreshCalls: number;
  refreshImpl: () => Promise<string | null>;
  forceLogoutCalls: { reason: string }[];
}

function createFakeAuth(): FakeAuth {
  let token: string | null = 'access-1';
  let identity: string | null = 'user-1';
  const state: FakeAuth = {
    refreshCalls: 0,
    forceLogoutCalls: [],
    refreshImpl: async () => {
      state.refreshCalls++;
      token = 'access-2';
      return token;
    },
    getAccessToken: () => token,
    getAuthIdentity: () => identity,
    refresh: () => state.refreshImpl(),
    forceLogout: (reason) => {
      state.forceLogoutCalls.push({ reason });
      token = null;
    },
    setAccessToken: (t) => (token = t),
    setIdentity: (id) => (identity = id),
  };
  return state;
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createHttpClient', () => {
  let auth: FakeAuth;
  let cache: ETagCache;
  let uuidSeq: number;

  beforeEach(() => {
    auth = createFakeAuth();
    cache = new ETagCache();
    uuidSeq = 0;
  });

  function make() {
    return createHttpClient({
      baseUrl: API,
      authProvider: auth,
      cache,
      uuid: () => `uuid-${++uuidSeq}`,
    });
  }

  it('attaches Authorization on protected calls and parses JSON', async () => {
    server.use(
      http.get(`${API}/users/me`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-1');
        return HttpResponse.json({ userId: 'u', displayName: 'A' });
      }),
    );
    const client = make();
    const me = await client.get<{ userId: string }>('/users/me');
    expect(me.userId).toBe('u');
  });

  it('attaches Authorization on /auth/* by default (path is not special)', async () => {
    server.use(
      http.post(`${API}/auth/logout-all`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-1');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = make();
    await client.post('/auth/logout-all');
  });

  it('omits Authorization when anonymous: true', async () => {
    server.use(
      http.get(`${API}/puzzles/daily/preview`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json({ date: '2024-01-01' });
      }),
    );
    const client = make();
    await client.get('/puzzles/daily/preview', { anonymous: true });
  });

  it('attaches a generated Idempotency-Key on POST, not GET', async () => {
    server.use(
      http.get(`${API}/users/me`, ({ request }) => {
        expect(request.headers.get('idempotency-key')).toBeNull();
        return HttpResponse.json({});
      }),
      http.post(`${API}/games`, ({ request }) => {
        expect(request.headers.get('idempotency-key')).toBe('uuid-1');
        return HttpResponse.json({ gameId: 'g' }, { status: 201 });
      }),
    );
    const client = make();
    await client.get('/users/me');
    await client.post('/games', { mode: 'Practice', difficulty: 'Easy' });
  });

  it('reuses the same Idempotency-Key when retried after refresh', async () => {
    const seenKeys: string[] = [];
    let posts = 0;
    server.use(
      http.post(`${API}/auth/refresh`, () => {
        return HttpResponse.json({ accessToken: 'access-2', refreshToken: 'rt-2' });
      }),
      http.post(`${API}/games`, ({ request }) => {
        seenKeys.push(request.headers.get('idempotency-key') ?? '');
        posts++;
        if (posts === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ gameId: 'g' }, { status: 201 });
      }),
    );
    const client = make();
    await client.post('/games', { mode: 'Practice', difficulty: 'Easy' });
    expect(seenKeys.length).toBe(2);
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(auth.refreshCalls).toBe(1);
  });

  it('runs a single refresh for parallel 401s (single-flight)', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;
    server.use(
      http.post(`${API}/auth/refresh`, async () => {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return HttpResponse.json({ accessToken: 'access-2', refreshToken: 'rt-2' });
      }),
      http.get(`${API}/users/me`, ({ request }) => {
        endpointCalls++;
        if (request.headers.get('authorization') === 'Bearer access-2') {
          return HttpResponse.json({ ok: true });
        }
        return new HttpResponse(null, { status: 401 });
      }),
    );

    // We have to make refresh actually call /auth/refresh via the auth provider:
    auth.refreshImpl = async () => {
      const res = await fetch(`${API}/auth/refresh`, { method: 'POST' });
      const body = (await res.json()) as { accessToken: string };
      auth.setAccessToken(body.accessToken);
      auth.refreshCalls++;
      return body.accessToken;
    };
    // The httpClient itself dedupes via the AuthProvider.refresh single-flight,
    // but our fake's refresh isn't single-flight unless we wrap it. Verify the
    // contract: the client calls refresh() at most once across concurrent 401s
    // when the provider's refresh promise is the same one. So make refresh()
    // return a memoized promise.
    let pending: Promise<string | null> | null = null;
    const rawRefresh = auth.refreshImpl;
    auth.refreshImpl = () => {
      if (!pending) pending = rawRefresh().finally(() => (pending = null));
      return pending;
    };

    const client = make();
    await Promise.all([client.get('/users/me'), client.get('/users/me'), client.get('/users/me')]);
    expect(refreshCalls).toBe(1);
    expect(endpointCalls).toBe(6); // 3 initial 401 + 3 retried 200
  });

  it('does NOT refresh on 401 when noRefresh: true (no recursion)', async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () => {
        return new HttpResponse(JSON.stringify({ title: 'token_reused' }), {
          status: 401,
          headers: { 'content-type': 'application/problem+json' },
        });
      }),
    );
    const client = make();
    auth.refresh = vi.fn();
    await expect(client.post('/auth/refresh', { refreshToken: 'rt' }, { noRefresh: true })).rejects.toBeInstanceOf(ApiError);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('caches and revalidates with ETag on /users; serves 304 from cache', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/users/me`, ({ request }) => {
        calls++;
        if (request.headers.get('if-none-match') === '"v1"') {
          return new HttpResponse(null, { status: 304, headers: { etag: '"v1"' } });
        }
        return HttpResponse.json({ name: 'alice' }, { headers: { etag: '"v1"' } });
      }),
    );
    const client = make();
    const first = await client.get<{ name: string }>('/users/me');
    expect(first).toEqual({ name: 'alice' });
    const second = await client.get<{ name: string }>('/users/me');
    expect(second).toEqual({ name: 'alice' });
    expect(calls).toBe(2);
  });

  it('does not cache or send If-None-Match on non-cacheable endpoints', async () => {
    server.use(
      http.get(`${API}/games/abc`, ({ request }) => {
        expect(request.headers.get('if-none-match')).toBeNull();
        return HttpResponse.json({}, { headers: { etag: '"vG"' } });
      }),
    );
    const client = make();
    await client.get('/games/abc');
    await client.get('/games/abc');
    expect(cache.size()).toBe(0);
  });

  it('throws ApiError on non-2xx responses and propagates ProblemDetails', async () => {
    server.use(
      http.put(`${API}/users/me`, () => {
        return HttpResponse.json(
          { title: 'display_name_in_use', detail: 'taken.' },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );
    const client = make();
    try {
      await client.put('/users/me', { displayName: 'x' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(409);
      expect(e.title).toBe('display_name_in_use');
      expect(e.detail).toBe('taken.');
    }
  });

  it('returns undefined for empty (204) responses', async () => {
    server.use(http.post(`${API}/games/x/abandon`, () => new HttpResponse(null, { status: 204 })));
    const client = make();
    const result = await client.post('/games/x/abandon');
    expect(result).toBeUndefined();
  });

  it('honours an explicit idempotencyKey: null (omits the header)', async () => {
    server.use(
      http.post(`${API}/games`, ({ request }) => {
        expect(request.headers.get('idempotency-key')).toBeNull();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const client = make();
    await client.post('/games', { mode: 'Practice', difficulty: 'Easy' }, { idempotencyKey: null });
  });

  it('honours a caller-provided idempotencyKey override', async () => {
    server.use(
      http.post(`${API}/games`, ({ request }) => {
        expect(request.headers.get('idempotency-key')).toBe('caller-key');
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const client = make();
    await client.post('/games', { mode: 'Practice', difficulty: 'Easy' }, { idempotencyKey: 'caller-key' });
  });
});

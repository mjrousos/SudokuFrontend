import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { useAuthStore } from './authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import { API_V1 } from '@/shared/config';
import {
  loadPersistedRefresh,
  savePersistedRefresh,
  type PersistedRefresh,
} from '@/shared/auth/tokenStorage';
import * as crossTabRefresh from '@/shared/auth/crossTabRefresh';
import type {
  AuthTokenResponse,
  LogoutRequest,
  RegisterResponse,
  UserProfileResponse,
} from '@/shared/api/types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
});

function createStore() {
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  return useAuthStore();
}

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function makeTokens(overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse {
  const userId = overrides.userId ?? 'user-1';
  return {
    accessToken: `access-${crypto.randomUUID()}`,
    accessTokenExpiresAt: isoIn(5 * 60_000),
    refreshToken: `refresh-${crypto.randomUUID()}`,
    refreshTokenExpiresAt: isoIn(7 * 24 * 60 * 60_000),
    userId,
    displayName: 'Alice',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfileResponse> = {}): UserProfileResponse {
  const userId = overrides.userId ?? 'user-1';
  return {
    userId,
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: isoAgo(24 * 60 * 60_000),
    ...overrides,
  };
}

function makeRegisterResponse(
  requiresEmailConfirmation: boolean,
  overrides: Partial<RegisterResponse> = {},
): RegisterResponse {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    requiresEmailConfirmation,
    emailConfirmationToken: requiresEmailConfirmation ? 'confirm-token' : null,
    ...overrides,
  };
}

function makePersistedRefresh(overrides: Partial<PersistedRefresh> = {}): PersistedRefresh {
  return {
    refreshToken: `persisted-${crypto.randomUUID()}`,
    refreshTokenExpiresAt: isoIn(7 * 24 * 60 * 60_000),
    userId: 'user-1',
    ...overrides,
  };
}

function problem(status: number, title: string, detail = title): HttpResponse {
  return new HttpResponse(JSON.stringify({ status, title, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function expectLoggedOut(store: ReturnType<typeof useAuthStore>): void {
  expect(store.isAuthenticated).toBe(false);
  expect(store.accessToken).toBeNull();
  expect(store.user).toBeNull();
  expect(loadPersistedRefresh()).toBeNull();
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAuthStore', () => {
  it('logs in successfully, hydrates the profile, and persists the refresh token', async () => {
    const loginResponse = makeTokens();
    const profileResponse = makeProfile({
      userId: loginResponse.userId,
      displayName: loginResponse.displayName,
    });

    server.use(
      http.post(`${API_V1}/auth/login`, async ({ request }) => {
        expect(await request.json()).toEqual({
          email: 'alice@example.com',
          password: 'correct horse battery staple',
        });
        return HttpResponse.json(loginResponse);
      }),
      http.get(`${API_V1}/users/me`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Bearer ${loginResponse.accessToken}`);
        return HttpResponse.json(profileResponse);
      }),
    );

    const store = createStore();
    await store.login({
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toMatchObject({
      userId: profileResponse.userId,
      displayName: profileResponse.displayName,
      email: profileResponse.email,
    });
    expect(loadPersistedRefresh()).toEqual({
      refreshToken: loginResponse.refreshToken,
      refreshTokenExpiresAt: loginResponse.refreshTokenExpiresAt,
      userId: loginResponse.userId,
    });
  });

  it.each([
    [401, 'invalid_credentials'],
    [423, 'account_locked'],
    [403, 'email_not_confirmed'],
  ] as const)(
    'rejects login with ApiError for %s %s and leaves auth state empty',
    async (status, title) => {
      server.use(http.post(`${API_V1}/auth/login`, () => problem(status, title)));

      const store = createStore();
      const loginPromise = store.login({
        email: 'alice@example.com',
        password: 'bad-password',
      });

      await expect(loginPromise).rejects.toBeInstanceOf(ApiError);
      await expect(loginPromise).rejects.toMatchObject({ status, title });
      expect(store.isAuthenticated).toBe(false);
      expect(store.user).toBeNull();
      expect(loadPersistedRefresh()).toBeNull();
    },
  );

  it('registers without email confirmation and does not auto-login', async () => {
    server.use(
      http.post(`${API_V1}/auth/register`, async ({ request }) => {
        expect(await request.json()).toEqual({
          email: 'alice@example.com',
          password: 'StrongPass123!',
          displayName: 'Alice',
        });
        return HttpResponse.json(makeRegisterResponse(false));
      }),
    );

    const store = createStore();
    await expect(
      store.register({
        email: 'alice@example.com',
        password: 'StrongPass123!',
        displayName: 'Alice',
      }),
    ).resolves.toEqual({ requiresEmailConfirmation: false });

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(loadPersistedRefresh()).toBeNull();
  });

  it('registers with email confirmation required and does not auto-login', async () => {
    server.use(
      http.post(`${API_V1}/auth/register`, () =>
        HttpResponse.json(makeRegisterResponse(true, { emailConfirmationToken: 'token-123' })),
      ),
    );

    const store = createStore();
    await expect(
      store.register({
        email: 'alice@example.com',
        password: 'StrongPass123!',
        displayName: 'Alice',
      }),
    ).resolves.toEqual({ requiresEmailConfirmation: true });

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(loadPersistedRefresh()).toBeNull();
  });

  it('logs out immediately, posts the refresh token, and still resolves on server failure', async () => {
    const store = createStore();
    const tokens = makeTokens();
    let logoutRequest: LogoutRequest | null = null;
    const requestSeen = deferred();
    const allowResponse = deferred();

    server.use(
      http.post(`${API_V1}/auth/logout`, async ({ request }) => {
        logoutRequest = (await request.json()) as LogoutRequest;
        requestSeen.resolve();
        await allowResponse.promise;
        return problem(500, 'logout_failed');
      }),
    );

    store._applyTokens(tokens);
    expect(store.isAuthenticated).toBe(true);
    const logoutPromise = store.logout();

    expectLoggedOut(store);
    await requestSeen.promise;
    expect(logoutRequest).toEqual({ refreshToken: tokens.refreshToken });

    allowResponse.resolve();
    await expect(logoutPromise).resolves.toBeUndefined();
  });

  it('posts /auth/logout-all and clears auth state in both success and failure paths', async () => {
    const authHeaders: Array<string | null> = [];
    let shouldFail = false;

    server.use(
      http.post(`${API_V1}/auth/logout-all`, ({ request }) => {
        authHeaders.push(request.headers.get('authorization'));
        return shouldFail ? problem(500, 'logout_all_failed') : new HttpResponse(null, { status: 204 });
      }),
    );

    const successStore = createStore();
    const successTokens = makeTokens({ accessToken: 'access-success' });
    successStore._applyTokens(successTokens);

    await expect(successStore.logoutAllSessions()).resolves.toBeUndefined();
    expectLoggedOut(successStore);

    const failureStore = createStore();
    const failureTokens = makeTokens({ accessToken: 'access-failure', userId: 'user-2' });
    shouldFail = true;
    failureStore._applyTokens(failureTokens);

    const logoutAllPromise = failureStore.logoutAllSessions();
    await expect(logoutAllPromise).rejects.toBeInstanceOf(ApiError);
    await expect(logoutAllPromise).rejects.toMatchObject({ status: 500, title: 'logout_all_failed' });
    expectLoggedOut(failureStore);
    expect(authHeaders).toEqual(['Bearer access-success', 'Bearer access-failure']);
  });

  it('refreshes the access token and updates the store on success', async () => {
    const store = createStore();
    const originalTokens = makeTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });
    const refreshedTokens = makeTokens({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      userId: originalTokens.userId,
    });
    let refreshBody: unknown;

    server.use(
      http.post(`${API_V1}/auth/refresh`, async ({ request }) => {
        refreshBody = await request.json();
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json(refreshedTokens);
      }),
    );

    store._applyTokens(originalTokens);

    await expect(store.refreshAccessToken()).resolves.toBe(refreshedTokens.accessToken);
    expect(refreshBody).toEqual({ refreshToken: originalTokens.refreshToken });
    expect(store.accessToken).toBe(refreshedTokens.accessToken);
    expect(loadPersistedRefresh()).toEqual({
      refreshToken: refreshedTokens.refreshToken,
      refreshTokenExpiresAt: refreshedTokens.refreshTokenExpiresAt,
      userId: refreshedTokens.userId,
    });
  });

  it('deduplicates concurrent refreshAccessToken calls into a single HTTP request', async () => {
    const store = createStore();
    const originalTokens = makeTokens({ refreshToken: 'refresh-single-flight' });
    const refreshedTokens = makeTokens({
      accessToken: 'access-single-flight',
      refreshToken: 'refresh-rotated',
      userId: originalTokens.userId,
    });
    let refreshCalls = 0;

    server.use(
      http.post(`${API_V1}/auth/refresh`, async () => {
        refreshCalls++;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json(refreshedTokens);
      }),
    );

    store._applyTokens(originalTokens);

    const [a, b, c] = await Promise.all([
      store.refreshAccessToken(),
      store.refreshAccessToken(),
      store.refreshAccessToken(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a).toBe(refreshedTokens.accessToken);
    expect(b).toBe(refreshedTokens.accessToken);
    expect(c).toBe(refreshedTokens.accessToken);
    expect(store.accessToken).toBe(refreshedTokens.accessToken);
  });

  it('force-logs out when refresh returns token_reused', async () => {
    const store = createStore();
    store._applyTokens(makeTokens());

    server.use(http.post(`${API_V1}/auth/refresh`, () => problem(401, 'token_reused')));

    await expect(store.refreshAccessToken()).resolves.toBeNull();
    expectLoggedOut(store);
  });

  it('force-logs out with session_expired semantics on any other 401 refresh failure', async () => {
    const store = createStore();
    store._applyTokens(makeTokens());

    server.use(http.post(`${API_V1}/auth/refresh`, () => problem(401, 'session_expired')));

    await expect(store.refreshAccessToken()).resolves.toBeNull();
    expectLoggedOut(store);
  });

  it('preserves auth state when refresh fails with a non-401 server error', async () => {
    const store = createStore();
    const seededTokens = makeTokens({ accessToken: 'access-before-error', refreshToken: 'refresh-before-error' });

    server.use(http.post(`${API_V1}/auth/refresh`, () => problem(500, 'refresh_failed')));

    store._applyTokens(seededTokens);
    const refreshPromise = store.refreshAccessToken();

    await expect(refreshPromise).rejects.toBeInstanceOf(ApiError);
    await expect(refreshPromise).rejects.toMatchObject({ status: 500, title: 'refresh_failed' });
    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe(seededTokens.accessToken);
    expect(loadPersistedRefresh()).toEqual({
      refreshToken: seededTokens.refreshToken,
      refreshTokenExpiresAt: seededTokens.refreshTokenExpiresAt,
      userId: seededTokens.userId,
    });
  });

  it('hydrates to an unauthenticated state when no refresh token is persisted', async () => {
    const store = createStore();

    await expect(store.hydrate()).resolves.toBeUndefined();
    expectLoggedOut(store);
  });

  it('drops an expired persisted refresh token during hydrate', async () => {
    savePersistedRefresh(
      makePersistedRefresh({
        refreshToken: 'expired-refresh',
        refreshTokenExpiresAt: isoAgo(60_000),
      }),
    );
    const store = createStore();

    await expect(store.hydrate()).resolves.toBeUndefined();
    expectLoggedOut(store);
  });

  it('hydrates from a valid persisted refresh token and loads the current profile', async () => {
    const persisted = makePersistedRefresh({ refreshToken: 'persisted-valid' });
    const refreshedTokens = makeTokens({
      accessToken: 'access-from-hydrate',
      refreshToken: 'refresh-from-hydrate',
      userId: persisted.userId,
      displayName: 'Hydrated Alice',
    });
    const profile = makeProfile({
      userId: persisted.userId,
      displayName: 'Hydrated Alice',
      email: 'hydrated@example.com',
    });

    savePersistedRefresh(persisted);
    server.use(
      http.post(`${API_V1}/auth/refresh`, async ({ request }) => {
        expect(await request.json()).toEqual({ refreshToken: persisted.refreshToken });
        return HttpResponse.json(refreshedTokens);
      }),
      http.get(`${API_V1}/users/me`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Bearer ${refreshedTokens.accessToken}`);
        return HttpResponse.json(profile);
      }),
    );

    const store = createStore();
    await store.hydrate();

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toMatchObject({
      userId: profile.userId,
      displayName: profile.displayName,
      email: profile.email,
    });
    expect(loadPersistedRefresh()).toEqual({
      refreshToken: refreshedTokens.refreshToken,
      refreshTokenExpiresAt: refreshedTokens.refreshTokenExpiresAt,
      userId: refreshedTokens.userId,
    });
  });

  it('deduplicates parallel hydrate calls so refresh only runs once', async () => {
    const persisted = makePersistedRefresh({ refreshToken: 'persisted-idempotent' });
    const refreshedTokens = makeTokens({
      accessToken: 'access-idempotent',
      refreshToken: 'refresh-idempotent',
      userId: persisted.userId,
    });
    const profile = makeProfile({ userId: persisted.userId, displayName: 'Alice Idempotent' });
    let refreshCalls = 0;
    let meCalls = 0;

    savePersistedRefresh(persisted);
    server.use(
      http.post(`${API_V1}/auth/refresh`, async () => {
        refreshCalls++;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json(refreshedTokens);
      }),
      http.get(`${API_V1}/users/me`, () => {
        meCalls++;
        return HttpResponse.json(profile);
      }),
    );

    const store = createStore();
    await Promise.all([store.hydrate(), store.hydrate()]);

    expect(refreshCalls).toBe(1);
    expect(meCalls).toBe(1);
    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toMatchObject({
      userId: profile.userId,
      displayName: profile.displayName,
      email: profile.email,
    });
  });

  it('hydrate called twice sequentially only invokes the network refresh once', async () => {
    const persisted = makePersistedRefresh({ refreshToken: 'persisted-sequential' });
    const refreshedTokens = makeTokens({
      accessToken: 'access-sequential',
      refreshToken: 'refresh-sequential',
      userId: persisted.userId,
    });
    const profile = makeProfile({ userId: persisted.userId });
    let refreshCalls = 0;

    savePersistedRefresh(persisted);
    server.use(
      http.post(`${API_V1}/auth/refresh`, async () => {
        refreshCalls++;
        return HttpResponse.json(refreshedTokens);
      }),
      http.get(`${API_V1}/users/me`, () => HttpResponse.json(profile)),
    );

    const store = createStore();
    await store.hydrate();
    await store.hydrate();

    expect(refreshCalls).toBe(1);
    expect(store.isAuthenticated).toBe(true);
  });

  it('refreshAccessToken returns null without a network call when tokens were nulled inside the lock', async () => {
    const store = createStore();
    store._applyTokens(makeTokens());
    let refreshCalls = 0;

    server.use(
      http.post(`${API_V1}/auth/refresh`, () => {
        refreshCalls++;
        return HttpResponse.json(makeTokens());
      }),
    );

    // Simulate a logged-out broadcast clearing state while this tab was
    // waiting to acquire the cross-tab lock.
    const spy = vi
      .spyOn(crossTabRefresh, 'withRefreshLock')
      .mockImplementationOnce(async (fn) => {
        store._clearStateLocally();
        return fn();
      });

    try {
      const result = await store.refreshAccessToken();
      expect(result).toBeNull();
      expect(refreshCalls).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('requests a password reset by posting the email address', async () => {
    let requestBody: unknown;
    server.use(
      http.post(`${API_V1}/auth/password-reset/request`, async ({ request }) => {
        requestBody = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );

    const store = createStore();
    await expect(store.requestPasswordReset('alice@example.com')).resolves.toBeUndefined();
    expect(requestBody).toEqual({ email: 'alice@example.com' });
  });

  it('confirms a password reset by posting email, token, and new password', async () => {
    let requestBody: unknown;
    server.use(
      http.post(`${API_V1}/auth/password-reset/confirm`, async ({ request }) => {
        requestBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const store = createStore();
    await expect(
      store.confirmPasswordReset({
        email: 'alice@example.com',
        token: 'reset-token',
        newPassword: 'BrandNewPass123!',
      }),
    ).resolves.toBeUndefined();
    expect(requestBody).toEqual({
      email: 'alice@example.com',
      token: 'reset-token',
      newPassword: 'BrandNewPass123!',
    });
  });

  it('confirms email by posting the userId and token', async () => {
    let requestBody: unknown;
    server.use(
      http.post(`${API_V1}/auth/confirm-email`, async ({ request }) => {
        requestBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const store = createStore();
    await expect(store.confirmEmail('user-1', 'confirm-token')).resolves.toBeUndefined();
    expect(requestBody).toEqual({ userId: 'user-1', token: 'confirm-token' });
  });
});

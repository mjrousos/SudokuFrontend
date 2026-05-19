import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import { API_V1 } from '@/shared/config';
import type {
  AuthTokenResponse,
  ChangePasswordRequest,
  UserProfileResponse,
} from '@/shared/api/types';

import { useProfileStore } from './profileStore';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
});

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function makeTokens(overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse {
  return {
    accessToken: 'access-token',
    accessTokenExpiresAt: isoIn(5 * 60_000),
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: isoIn(7 * 24 * 60 * 60_000),
    userId: 'user-1',
    displayName: 'Alice',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfileResponse> = {}): UserProfileResponse {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: isoAgo(24 * 60 * 60_000),
    ...overrides,
  };
}

function problem(status: number, title: string, detail = title): HttpResponse {
  return new HttpResponse(JSON.stringify({ status, title, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

describe('useProfileStore', () => {
  it('load populates the profile', async () => {
    const tokens = makeTokens({ accessToken: 'access-load' });
    const auth = useAuthStore();
    auth._applyTokens(tokens);
    const store = useProfileStore();
    const profile = makeProfile();

    server.use(
      http.get(`${API_V1}/users/me`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Bearer ${tokens.accessToken}`);
        return HttpResponse.json(profile);
      }),
    );

    await expect(store.load()).resolves.toEqual(profile);
    expect(store.profile).toEqual(profile);
  });

  it('updateDisplayName updates the profile and merges it into auth state', async () => {
    const auth = useAuthStore();
    auth._applyTokens(makeTokens({ displayName: 'Alice' }));
    const store = useProfileStore();
    store.profile = makeProfile();
    const updated = makeProfile({ displayName: 'Alicia' });

    server.use(
      http.put(`${API_V1}/users/me`, async ({ request }) => {
        expect(await request.json()).toEqual({ displayName: 'Alicia' });
        return HttpResponse.json(updated);
      }),
    );

    await expect(store.updateDisplayName('Alicia')).resolves.toEqual(updated);
    expect(store.profile).toEqual(updated);
    expect(auth.user).toMatchObject({
      userId: updated.userId,
      displayName: updated.displayName,
      email: updated.email,
    });
  });

  it('updateDisplayName rethrows a 409 without mutating the stored profile', async () => {
    const auth = useAuthStore();
    auth._applyTokens(makeTokens({ displayName: 'Alice' }));
    const store = useProfileStore();
    const profile = makeProfile({ displayName: 'Alice' });
    store.profile = profile;

    server.use(
      http.put(`${API_V1}/users/me`, () => problem(409, 'display_name_in_use', 'That name is taken.')),
    );

    const updatePromise = store.updateDisplayName('Taken');

    await expect(updatePromise).rejects.toBeInstanceOf(ApiError);
    await expect(updatePromise).rejects.toMatchObject({
      status: 409,
      title: 'display_name_in_use',
    });
    expect(store.profile).toEqual(profile);
    expect(auth.user?.displayName).toBe('Alice');
  });

  it('changePassword rethrows a 401 when the current password is wrong', async () => {
    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const store = useProfileStore();
    let requestBody: ChangePasswordRequest | null = null;
    let passwordAttempts = 0;

    server.use(
      http.post(`${API_V1}/auth/refresh`, () =>
        HttpResponse.json(makeTokens({ accessToken: 'access-refreshed' })),
      ),
      http.post(`${API_V1}/users/me/password`, async ({ request }) => {
        requestBody = (await request.json()) as ChangePasswordRequest;
        passwordAttempts++;
        return problem(401, 'invalid_current_password', 'Wrong password.');
      }),
    );

    const changePromise = store.changePassword({
      currentPassword: 'wrong-password',
      newPassword: 'BetterPassword123!',
    });

    await expect(changePromise).rejects.toBeInstanceOf(ApiError);
    await expect(changePromise).rejects.toMatchObject({
      status: 401,
      title: 'invalid_current_password',
    });
    expect(passwordAttempts).toBe(2);
    expect(requestBody).toEqual({
      currentPassword: 'wrong-password',
      newPassword: 'BetterPassword123!',
    });
  });

  it('deleteAccount clears local state and resolves void', async () => {
    const auth = useAuthStore();
    auth._applyTokens(makeTokens({ accessToken: 'access-delete' }));
    const store = useProfileStore();
    store.profile = makeProfile();

    server.use(
      http.delete(`${API_V1}/users/me`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-delete');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(store.deleteAccount()).resolves.toBeUndefined();
    expect(store.profile).toBeNull();
    expect(store.error).toBeNull();
  });
});

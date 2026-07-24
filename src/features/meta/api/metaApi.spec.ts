import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { __resetHttpClientForTests } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { API_V1 } from '@/shared/config';
import type { AuthTokenResponse } from '@/shared/api/types';

import { metaApi } from './metaApi';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  // Instantiating the auth store installs the shared HTTP client.
  useAuthStore();
});

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function makeTokens(): AuthTokenResponse {
  return {
    accessToken: 'access-token',
    accessTokenExpiresAt: isoIn(5 * 60_000),
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: isoIn(7 * 24 * 60 * 60_000),
    userId: 'user-1',
    displayName: 'Alice',
  };
}

describe('metaApi.version', () => {
  it('GETs /api/v1/version and returns the parsed body', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_V1}/version`, () => {
        calls++;
        return HttpResponse.json({ version: '1.2.3' });
      }),
    );

    await expect(metaApi.version()).resolves.toEqual({ version: '1.2.3' });
    expect(calls).toBe(1);
  });

  it('does not send an Authorization header even when authenticated', async () => {
    // Install the client with a logged-in identity, then confirm the version
    // call still opts out of auth (anonymous public metadata).
    useAuthStore()._applyTokens(makeTokens());

    let authHeader: string | null = 'unset';
    server.use(
      http.get(`${API_V1}/version`, ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({ version: '9.9.9' });
      }),
    );

    await metaApi.version();
    expect(authHeader).toBeNull();
  });
});

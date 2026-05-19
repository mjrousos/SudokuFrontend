import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import { API_V1 } from '@/shared/config';
import type { AuthTokenResponse, UserStatsDto } from '@/shared/api/types';

import { useStatsStore } from './statsStore';

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

function makeStats(overrides: Partial<UserStatsDto> = {}): UserStatsDto {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    gamesStarted: 14,
    gamesCompleted: 11,
    gamesAbandoned: 3,
    rankedCompletions: 6,
    assistedCompletions: 2,
    currentDailyStreak: 4,
    longestDailyStreak: 9,
    byDifficulty: [
      {
        difficulty: 'Easy',
        rankedCompletions: 3,
        bestElapsedMs: 64_000,
        averageElapsedMs: 81_000,
        winRate: 0.75,
      },
    ],
    ...overrides,
  };
}

function problem(status: number, title: string, detail = title): HttpResponse {
  return new HttpResponse(JSON.stringify({ status, title, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

describe('useStatsStore', () => {
  it('loadMine caches and does not refetch', async () => {
    const tokens = makeTokens({ accessToken: 'access-mine' });
    const auth = useAuthStore();
    auth._applyTokens(tokens);
    const store = useStatsStore();
    const stats = makeStats();
    let calls = 0;

    server.use(
      http.get(`${API_V1}/users/me/stats`, ({ request }) => {
        calls++;
        expect(request.headers.get('authorization')).toBe(`Bearer ${tokens.accessToken}`);
        return HttpResponse.json(stats);
      }),
    );

    await expect(store.loadMine()).resolves.toEqual(stats);
    await expect(store.loadMine()).resolves.toEqual(stats);
    expect(calls).toBe(1);
    expect(store.get('me')).toEqual(stats);
  });

  it('loadByUserId works for arbitrary ids and encodes special characters', async () => {
    const tokens = makeTokens({ accessToken: 'access-public' });
    const auth = useAuthStore();
    auth._applyTokens(tokens);
    const store = useStatsStore();
    const rawUserId = 'user/with spaces?and#symbols';
    const encodedUserId = encodeURIComponent(rawUserId);
    const stats = makeStats({ userId: rawUserId, displayName: 'Public Alice' });

    server.use(
      http.get(`${API_V1}/users/${encodedUserId}/stats`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json(stats);
      }),
    );

    await expect(store.loadByUserId(rawUserId)).resolves.toEqual(stats);
    expect(store.get(rawUserId)).toEqual(stats);
  });

  it('sets error and rethrows when the server returns an ApiError', async () => {
    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const store = useStatsStore();

    server.use(http.get(`${API_V1}/users/me/stats`, () => problem(500, 'stats_failed', 'Boom.')));

    const loadPromise = store.loadMine();

    await expect(loadPromise).rejects.toBeInstanceOf(ApiError);
    await expect(loadPromise).rejects.toMatchObject({ status: 500, title: 'stats_failed' });
    expect(store.error).toMatchObject({ status: 500, title: 'stats_failed' });
    expect(store.get('me')).toBeNull();
  });
});

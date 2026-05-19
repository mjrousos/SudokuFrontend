import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { todayUtc, useDailyStore } from './dailyStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useGamesStore } from '@/features/game/store/gamesStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import {
  type DailyPreviewResponse,
  type GameResponse,
  Difficulty,
  GameMode,
  GameStatus,
} from '@/shared/api/types';
import { API_V1 } from '@/shared/config';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makePreview(overrides: Partial<DailyPreviewResponse> = {}): DailyPreviewResponse {
  return {
    date: '2024-03-14',
    difficulty: Difficulty.Medium,
    givens: GIVENS,
    ...overrides,
  };
}

function makeGameResponse(overrides: Partial<GameResponse> = {}): GameResponse {
  return {
    gameId: 'g-daily',
    puzzleId: 'p-daily',
    mode: GameMode.Daily,
    difficulty: Difficulty.Medium,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard: GIVENS,
    startedAt: '2024-03-15T00:00:00Z',
    completedAt: null,
    abandonedAt: null,
    completedElapsedMs: null,
    elapsedMs: 0,
    hintCount: 0,
    mistakeCount: 0,
    isAssisted: false,
    nextMoveNumber: 1,
    ...overrides,
  };
}

function authenticate(): void {
  const auth = useAuthStore();
  auth._applyTokens(
    {
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      userId: 'user-1',
      displayName: 'Tester',
    },
    { broadcast: false, persist: false },
  );
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  useAuthStore();
  authenticate();
});

describe('useDailyStore.loadPreview', () => {
  it('caches successful responses and does not refetch', async () => {
    let calls = 0;
    const preview = makePreview({ date: '2024-03-12' });

    server.use(
      http.get(`${API_V1}/puzzles/daily/preview`, ({ request }) => {
        calls++;
        expect(request.headers.get('authorization')).toBeNull();
        expect(new URL(request.url).searchParams.get('date')).toBe('2024-03-12');
        return HttpResponse.json(preview);
      }),
    );

    const store = useDailyStore();
    const first = await store.loadPreview('2024-03-12');
    const second = await store.loadPreview('2024-03-12');

    expect(first).toEqual(preview);
    expect(second).toEqual(preview);
    expect(store.previewByDate['2024-03-12']).toEqual(preview);
    expect(calls).toBe(1);
  });

  it('marks 404 as unavailable without throwing', async () => {
    server.use(
      http.get(`${API_V1}/puzzles/daily/preview`, () =>
        HttpResponse.json({ title: 'daily_preview_not_available' }, { status: 404 }),
      ),
    );

    const store = useDailyStore();

    await expect(store.loadPreview('2024-03-15')).resolves.toBeNull();
    expect(store.unavailableByDate['2024-03-15']).toBe(true);
    expect(store.previewByDate['2024-03-15']).toBeUndefined();
    expect(store.lastError).toBeNull();
  });

  it('stores lastError on non-404 failures and rethrows', async () => {
    server.use(
      http.get(`${API_V1}/puzzles/daily/preview`, () =>
        HttpResponse.json({ title: 'server_error', detail: 'Broken.' }, { status: 500 }),
      ),
    );

    const store = useDailyStore();
    const previewPromise = store.loadPreview('2024-03-10');

    await expect(previewPromise).rejects.toBeInstanceOf(ApiError);
    await expect(previewPromise).rejects.toMatchObject({ status: 500, title: 'server_error' });
    expect(store.lastError?.status).toBe(500);
  });
});

describe('useDailyStore.startToday', () => {
  it('POSTs /games/daily and resolves with the projected game', async () => {
    const game = makeGameResponse({ gameId: 'g-today' });

    server.use(
      http.post(`${API_V1}/games/daily`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-token');
        return HttpResponse.json(game, { status: 201 });
      }),
    );

    const daily = useDailyStore();
    const games = useGamesStore();
    const vm = await daily.startToday();

    expect(vm.gameId).toBe('g-today');
    expect(vm.grid.length).toBe(9);
    expect(games.currentGameId).toBe('g-today');
  });

  it('rethrows ApiError on failure', async () => {
    server.use(
      http.post(`${API_V1}/games/daily`, () =>
        HttpResponse.json({ title: 'daily_unavailable', detail: 'Try again later.' }, { status: 503 }),
      ),
    );

    const daily = useDailyStore();
    const startPromise = daily.startToday();

    await expect(startPromise).rejects.toBeInstanceOf(ApiError);
    await expect(startPromise).rejects.toMatchObject({ status: 503, title: 'daily_unavailable' });
    expect(daily.lastError?.status).toBe(503);
  });
});

describe('todayUtc', () => {
  it("returns '2024-03-15' for 2024-03-15T23:30:00Z", () => {
    expect(todayUtc(new Date('2024-03-15T23:30:00Z'))).toBe('2024-03-15');
  });

  it("returns '2024-03-15' for 2024-03-15T00:00:00Z", () => {
    expect(todayUtc(new Date('2024-03-15T00:00:00Z'))).toBe('2024-03-15');
  });
});

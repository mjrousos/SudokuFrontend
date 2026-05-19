import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { API_V1 } from '@/shared/config';
import type { LeaderboardEntryDto } from '@/shared/api/types';
import { Difficulty, LeaderboardPeriod } from '@/shared/api/types';
import {
  cacheKey,
  useLeaderboardsStore,
  type LeaderboardsQueryArgs,
} from './leaderboardsStore';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  __resetHttpClientForTests();
});

function createStore() {
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  useAuthStore();
  return useLeaderboardsStore();
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

function difficultyArgs(period: LeaderboardPeriod = LeaderboardPeriod.All): LeaderboardsQueryArgs {
  return {
    kind: 'difficulty',
    difficulty: Difficulty.Easy,
    period,
    pageSize: 20,
  };
}

function dailyArgs(date = '2024-02-01'): LeaderboardsQueryArgs {
  return {
    kind: 'daily',
    date,
    pageSize: 20,
  };
}

function makeEntry(rank: number, overrides: Partial<LeaderboardEntryDto> = {}): LeaderboardEntryDto {
  return {
    entryId: `entry-${rank}`,
    rank,
    userId: `user-${rank}`,
    displayName: `Player ${rank}`,
    puzzleId: `puzzle-${rank}`,
    difficulty: Difficulty.Easy,
    elapsedMs: rank * 60_000,
    completedAt: `2024-02-${String(rank).padStart(2, '0')}T00:00:00Z`,
    dailyDate: '2024-02-01',
    ...overrides,
  };
}

function makePage(items: LeaderboardEntryDto[], nextCursor: string | null = null) {
  return {
    items,
    pageSize: 20,
    nextCursor,
  };
}

function lockedResponse(): HttpResponse {
  return new HttpResponse(JSON.stringify({ status: 409, title: 'not_available_yet' }), {
    status: 409,
    headers: { 'content-type': 'application/problem+json' },
  });
}

describe('cacheKey', () => {
  it('is stable and order-insensitive for the same inputs', () => {
    const first = cacheKey({
      kind: 'difficulty',
      difficulty: Difficulty.Easy,
      period: LeaderboardPeriod.All,
      pageSize: 20,
    });
    const second = cacheKey({
      pageSize: 20,
      period: LeaderboardPeriod.All,
      difficulty: Difficulty.Easy,
      kind: 'difficulty',
    });

    expect(first).toBe('difficulty|Easy|All|-|20');
    expect(second).toBe(first);
  });
});

describe('useLeaderboardsStore', () => {
  it('load populates the cache, toggles loading, and stores entries', async () => {
    const gate = deferred();
    const page = makePage([makeEntry(1)], 'next-1');
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, async () => {
        await gate.promise;
        return HttpResponse.json(page);
      }),
    );

    const store = createStore();
    const args = difficultyArgs();
    const loadPromise = store.load(args);

    expect(store.get(args).loading).toBe(true);

    gate.resolve();
    await loadPromise;

    expect(store.get(args)).toMatchObject({
      entries: page.items,
      nextCursor: 'next-1',
      loading: false,
      error: null,
      locked: false,
    });
  });

  it('load with a 409 sets locked=true and clears entries', async () => {
    server.use(http.get(`${API_V1}/leaderboards/daily`, () => lockedResponse()));

    const store = createStore();
    const args = dailyArgs();

    await expect(store.load(args)).resolves.toBeUndefined();
    expect(store.get(args)).toMatchObject({
      entries: [],
      nextCursor: null,
      loading: false,
      error: null,
      locked: true,
    });
  });

  it('load overwrites the cache instead of appending', async () => {
    let call = 0;
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, () => {
        call++;
        return HttpResponse.json(
          call === 1 ? makePage([makeEntry(1)], 'next-1') : makePage([makeEntry(2)], null),
        );
      }),
    );

    const store = createStore();
    const args = difficultyArgs();

    await store.load(args);
    await store.load(args);

    expect(store.get(args).entries).toEqual([makeEntry(2)]);
  });

  it('loadMore appends to entries and updates nextCursor', async () => {
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'next-1') {
          return HttpResponse.json(makePage([makeEntry(2)], null));
        }
        return HttpResponse.json(makePage([makeEntry(1)], 'next-1'));
      }),
    );

    const store = createStore();
    const args = difficultyArgs();

    await store.load(args);
    await store.loadMore(args);

    expect(store.get(args)).toMatchObject({
      entries: [makeEntry(1), makeEntry(2)],
      nextCursor: null,
      loading: false,
      locked: false,
    });
  });

  it('loadMore with nextCursor=null is a no-op', async () => {
    let requests = 0;
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, () => {
        requests++;
        return HttpResponse.json(makePage([makeEntry(1)], null));
      }),
    );

    const store = createStore();
    const args = difficultyArgs();

    await store.loadMore(args);

    expect(requests).toBe(0);
    expect(store.get(args).entries).toEqual([]);
  });

  it('loadMore with concurrent calls only fires one HTTP request', async () => {
    const gate = deferred();
    let pagedRequests = 0;
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'next-1') {
          pagedRequests++;
          await gate.promise;
          return HttpResponse.json(makePage([makeEntry(2)], null));
        }
        return HttpResponse.json(makePage([makeEntry(1)], 'next-1'));
      }),
    );

    const store = createStore();
    const args = difficultyArgs();

    await store.load(args);
    const first = store.loadMore(args);
    const second = store.loadMore(args);

    expect(store.get(args).loading).toBe(true);

    gate.resolve();
    await Promise.all([first, second]);

    expect(pagedRequests).toBe(1);
    expect(store.get(args).entries).toEqual([makeEntry(1), makeEntry(2)]);
  });

  it('different cache keys are isolated', async () => {
    server.use(
      http.get(`${API_V1}/leaderboards/Easy`, ({ request }) => {
        const period = new URL(request.url).searchParams.get('period');
        if (period === LeaderboardPeriod.Daily) {
          return HttpResponse.json(makePage([makeEntry(2, { displayName: 'Daily player' })]));
        }
        return HttpResponse.json(makePage([makeEntry(1, { displayName: 'All-time player' })]));
      }),
    );

    const store = createStore();
    const allArgs = difficultyArgs(LeaderboardPeriod.All);
    const dailyPeriodArgs = difficultyArgs(LeaderboardPeriod.Daily);

    await store.load(allArgs);
    await store.load(dailyPeriodArgs);

    expect(store.get(allArgs).entries).toEqual([makeEntry(1, { displayName: 'All-time player' })]);
    expect(store.get(dailyPeriodArgs).entries).toEqual([
      makeEntry(2, { displayName: 'Daily player' }),
    ]);
    expect(cacheKey(allArgs)).not.toBe(cacheKey(dailyPeriodArgs));
  });
});

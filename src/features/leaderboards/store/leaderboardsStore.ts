import { defineStore } from 'pinia';
import { reactive } from 'vue';

import { leaderboardsApi } from '../api/leaderboardsApi';
import { ApiError } from '@/shared/api/problemDetails';
import type {
  Difficulty,
  LeaderboardEntryDto,
  LeaderboardPeriod,
} from '@/shared/api/types';

export interface LeaderboardCacheEntry {
  entries: LeaderboardEntryDto[];
  nextCursor: string | null;
  loading: boolean;
  error: ApiError | null;
  locked: boolean;
}

export interface DifficultyLeaderboardArgs {
  kind: 'difficulty';
  difficulty: Difficulty;
  period: LeaderboardPeriod;
  pageSize: number;
  date?: undefined;
}

export interface DailyLeaderboardArgs {
  kind: 'daily';
  date: string;
  pageSize: number;
  difficulty?: undefined;
  period?: undefined;
}

export type LeaderboardsQueryArgs = DifficultyLeaderboardArgs | DailyLeaderboardArgs;

function createEmptyEntry(): LeaderboardCacheEntry {
  return {
    entries: [],
    nextCursor: null,
    loading: false,
    error: null,
    locked: false,
  };
}

function isLockedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409 && error.title === 'not_available_yet';
}

async function fetchPage(args: LeaderboardsQueryArgs, cursor: string | null) {
  if (args.kind === 'difficulty') {
    return leaderboardsApi.byDifficulty({
      difficulty: args.difficulty,
      period: args.period,
      pageSize: args.pageSize,
      cursor,
    });
  }

  return leaderboardsApi.daily({
    date: args.date,
    pageSize: args.pageSize,
    cursor,
  });
}

export function cacheKey(args: LeaderboardsQueryArgs): string {
  return `${args.kind}|${args.difficulty ?? '-'}|${args.period ?? '-'}|${args.date ?? '-'}|${args.pageSize}`;
}

export const useLeaderboardsStore = defineStore('leaderboards', () => {
  const byKey = reactive<Record<string, LeaderboardCacheEntry>>({});

  function setEntry(key: string, entry: LeaderboardCacheEntry): LeaderboardCacheEntry {
    byKey[key] = entry;
    return byKey[key]!;
  }

  function get(args: LeaderboardsQueryArgs): LeaderboardCacheEntry {
    const key = cacheKey(args);
    if (!(key in byKey)) {
      return setEntry(key, createEmptyEntry());
    }
    return byKey[key]!;
  }

  async function load(args: LeaderboardsQueryArgs): Promise<void> {
    const key = cacheKey(args);
    setEntry(key, {
      ...createEmptyEntry(),
      loading: true,
    });

    try {
      const page = await fetchPage(args, null);
      setEntry(key, {
        entries: [...page.items],
        nextCursor: page.nextCursor,
        loading: false,
        error: null,
        locked: false,
      });
    } catch (error) {
      if (isLockedError(error)) {
        setEntry(key, {
          ...createEmptyEntry(),
          locked: true,
        });
        return;
      }

      const current = get(args);
      setEntry(key, {
        ...current,
        loading: false,
        error: error instanceof ApiError ? error : null,
      });
      throw error;
    }
  }

  async function loadMore(args: LeaderboardsQueryArgs): Promise<void> {
    const key = cacheKey(args);
    const current = get(args);
    if (current.nextCursor === null || current.loading) {
      return;
    }

    const cursor = current.nextCursor;
    setEntry(key, {
      ...current,
      loading: true,
      error: null,
    });

    try {
      const page = await fetchPage(args, cursor);
      const latest = get(args);
      setEntry(key, {
        entries: [...latest.entries, ...page.items],
        nextCursor: page.nextCursor,
        loading: false,
        error: null,
        locked: false,
      });
    } catch (error) {
      const latest = get(args);
      if (isLockedError(error)) {
        setEntry(key, {
          ...latest,
          nextCursor: null,
          loading: false,
          error: null,
          locked: true,
        });
        return;
      }

      setEntry(key, {
        ...latest,
        loading: false,
        error: error instanceof ApiError ? error : null,
      });
      throw error;
    }
  }

  function reset(): void {
    for (const key of Object.keys(byKey)) {
      delete byKey[key];
    }
  }

  return {
    byKey,
    get,
    load,
    loadMore,
    reset,
  };
});

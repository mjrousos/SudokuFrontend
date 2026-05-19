import { getHttpClient } from '@/shared/api/client';
import { decodeLeaderboardPage } from '@/shared/api/enumCodec';
import type {
  Difficulty,
  LeaderboardPage,
  LeaderboardPeriod,
} from '@/shared/api/types';

interface ByDifficultyParams {
  difficulty: Difficulty;
  period: LeaderboardPeriod;
  pageSize: number;
  cursor?: string | null;
}

interface DailyParams {
  date: string;
  pageSize: number;
  cursor?: string | null;
}

const base = '/leaderboards';

function withQuery(
  path: string,
  query: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}

export const leaderboardsApi = {
  byDifficulty: async (
    { difficulty, period, pageSize, cursor }: ByDifficultyParams,
    signal?: AbortSignal,
  ): Promise<LeaderboardPage> => {
    // ASP.NET's model binder accepts enum names ("Easy", "All") in route and
    // query parameters, so we pass the string identifiers as-is here. JSON
    // response bodies use integer enums, so we decode the page before returning.
    const raw = await getHttpClient().get<unknown>(
      withQuery(`${base}/${encodeURIComponent(difficulty)}`, {
        period,
        pageSize,
        cursor,
      }),
      { anonymous: true, signal },
    );
    return decodeLeaderboardPage(raw);
  },

  daily: async (
    { date, pageSize, cursor }: DailyParams,
    signal?: AbortSignal,
  ): Promise<LeaderboardPage> => {
    const raw = await getHttpClient().get<unknown>(
      withQuery(`${base}/daily`, {
        date,
        pageSize,
        cursor,
      }),
      { anonymous: true, signal },
    );
    return decodeLeaderboardPage(raw);
  },
};

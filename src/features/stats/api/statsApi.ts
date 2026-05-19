import { getHttpClient } from '@/shared/api/client';
import { decodeUserStats } from '@/shared/api/enumCodec';
import type { UserStatsDto } from '@/shared/api/types';

export const statsApi = {
  me: async (signal?: AbortSignal): Promise<UserStatsDto> => {
    const raw = await getHttpClient().get<unknown>('/users/me/stats', { signal });
    return decodeUserStats(raw);
  },

  byUserId: async (userId: string, signal?: AbortSignal): Promise<UserStatsDto> => {
    const raw = await getHttpClient().get<unknown>(
      `/users/${encodeURIComponent(userId)}/stats`,
      {
        anonymous: true,
        signal,
      },
    );
    return decodeUserStats(raw);
  },
};

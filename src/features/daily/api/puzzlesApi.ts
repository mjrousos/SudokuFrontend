import { getHttpClient } from '@/shared/api/client';
import { decodeDailyPreview } from '@/shared/api/enumCodec';
import type { DailyPreviewResponse } from '@/shared/api/types';

const base = '/puzzles';

export const puzzlesApi = {
  dailyPreview: async (date?: string, signal?: AbortSignal): Promise<DailyPreviewResponse> => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    const path = `${base}/daily/preview${params.size > 0 ? `?${params.toString()}` : ''}`;

    const raw = await getHttpClient().get<unknown>(path, {
      anonymous: true,
      signal,
    });
    return decodeDailyPreview(raw);
  },
};

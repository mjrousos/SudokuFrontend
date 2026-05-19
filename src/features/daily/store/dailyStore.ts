import { defineStore } from 'pinia';
import { ref } from 'vue';

import { useGamesStore } from '@/features/game/store/gamesStore';
import { ApiError } from '@/shared/api/problemDetails';
import type { DailyPreviewResponse } from '@/shared/api/types';
import type { GameViewModel } from '@/shared/sudoku/types';
import { puzzlesApi } from '../api/puzzlesApi';

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const useDailyStore = defineStore('daily', () => {
  const previewByDate = ref<Record<string, DailyPreviewResponse>>({});
  const loadingByDate = ref<Record<string, boolean>>({});
  const unavailableByDate = ref<Record<string, boolean>>({});
  const lastError = ref<ApiError | null>(null);

  async function loadPreview(date: string): Promise<DailyPreviewResponse | null> {
    if (previewByDate.value[date]) return previewByDate.value[date]!;
    if (unavailableByDate.value[date]) return null;

    loadingByDate.value = { ...loadingByDate.value, [date]: true };
    lastError.value = null;

    try {
      const preview = await puzzlesApi.dailyPreview(date);
      previewByDate.value = { ...previewByDate.value, [date]: preview };
      unavailableByDate.value = { ...unavailableByDate.value, [date]: false };
      return preview;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          unavailableByDate.value = { ...unavailableByDate.value, [date]: true };
          return null;
        }

        lastError.value = err;
      }

      throw err;
    } finally {
      loadingByDate.value = { ...loadingByDate.value, [date]: false };
    }
  }

  async function startToday(): Promise<GameViewModel> {
    lastError.value = null;

    try {
      return await useGamesStore().createDaily();
    } catch (err) {
      if (err instanceof ApiError) {
        lastError.value = err;
      }

      throw err;
    }
  }

  function reset(): void {
    previewByDate.value = {};
    loadingByDate.value = {};
    unavailableByDate.value = {};
    lastError.value = null;
  }

  return {
    previewByDate,
    loadingByDate,
    unavailableByDate,
    lastError,
    loadPreview,
    startToday,
    reset,
  };
});

import { defineStore } from 'pinia';
import { ref } from 'vue';

import { statsApi } from '../api/statsApi';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import type { UserStatsDto } from '@/shared/api/types';

const ME_KEY = 'me';

export const useStatsStore = defineStore('stats', () => {
  const byUserId = ref<Record<string, UserStatsDto>>({});
  const loading = ref<Record<string, boolean>>({});
  const error = ref<ApiError | null>(null);
  const mineUserId = ref<string | null>(null);

  const inFlight = new Map<string, Promise<UserStatsDto>>();

  function get(idOrMe: string): UserStatsDto | null {
    return byUserId.value[idOrMe] ?? null;
  }

  async function loadCached(
    key: string,
    loader: () => Promise<UserStatsDto>,
  ): Promise<UserStatsDto> {
    const cached = byUserId.value[key];
    if (cached && !(loading.value[key] ?? false)) {
      return cached;
    }

    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }

    loading.value = { ...loading.value, [key]: true };
    error.value = null;

    const request = loader()
      .then((stats) => {
        byUserId.value = { ...byUserId.value, [key]: stats };
        return stats;
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          error.value = err;
        }
        throw err;
      })
      .finally(() => {
        loading.value = { ...loading.value, [key]: false };
        inFlight.delete(key);
      });

    inFlight.set(key, request);
    return request;
  }

  async function loadMine(): Promise<UserStatsDto> {
    const auth = useAuthStore();
    const currentIdentity = auth.authIdentity ?? null;
    const cached = byUserId.value[ME_KEY];

    if (cached && mineUserId.value === currentIdentity && !(loading.value[ME_KEY] ?? false)) {
      return cached;
    }

    if (mineUserId.value !== currentIdentity) {
      const { [ME_KEY]: _unused, ...rest } = byUserId.value;
      byUserId.value = rest;
    }

    const stats = await loadCached(ME_KEY, () => statsApi.me());
    mineUserId.value = stats.userId;
    return stats;
  }

  async function loadByUserId(userId: string): Promise<UserStatsDto> {
    return loadCached(userId, () => statsApi.byUserId(userId));
  }

  function reset(): void {
    byUserId.value = {};
    loading.value = {};
    error.value = null;
    mineUserId.value = null;
    inFlight.clear();
  }

  return {
    byUserId,
    loading,
    error,
    loadMine,
    loadByUserId,
    get,
    reset,
  };
});

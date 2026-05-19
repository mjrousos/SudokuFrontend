import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import type { AuthTokenResponse, UserStatsDto } from '@/shared/api/types';

import { useStatsStore } from '../store/statsStore';
import StatsView from './StatsView.vue';

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
    gamesStarted: 12,
    gamesCompleted: 9,
    gamesAbandoned: 3,
    rankedCompletions: 5,
    assistedCompletions: 1,
    currentDailyStreak: 2,
    longestDailyStreak: 6,
    byDifficulty: [
      {
        difficulty: 'Easy',
        rankedCompletions: 2,
        bestElapsedMs: 61_000,
        averageElapsedMs: 80_000,
        winRate: 0.8,
      },
    ],
    ...overrides,
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/login', name: 'login', component: { template: '<div>login</div>' } },
      { path: '/stats', name: 'stats', component: StatsView },
      { path: '/users/:userId/stats', name: 'stats.public', component: StatsView, props: true },
    ],
  });
}

describe('StatsView', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetHttpClientForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetHttpClientForTests();
  });

  it('calls loadByUserId for the public route and renders the summary', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/users/user-42/stats');
    await router.isReady();

    useAuthStore();
    const statsStore = useStatsStore();
    const stats = makeStats({ userId: 'user-42', displayName: 'Puzzle Ace', gamesStarted: 22 });
    const loadByUserId = vi
      .spyOn(statsStore, 'loadByUserId')
      .mockImplementation(async (userId: string) => {
        statsStore.byUserId = { ...statsStore.byUserId, [userId]: stats };
        return stats;
      });

    const wrapper = mount(StatsView, {
      props: { userId: 'user-42' },
      global: { plugins: [pinia, router] },
    });

    await flushPromises();

    expect(loadByUserId).toHaveBeenCalledWith('user-42');
    expect(wrapper.get('[data-testid="stats-summary"]').text()).toContain('22');
    expect(wrapper.text()).toContain('Puzzle Ace');
  });

  it('calls loadMine when mounted without a userId for an authenticated user', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/stats');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const statsStore = useStatsStore();
    const stats = makeStats();
    const loadMine = vi.spyOn(statsStore, 'loadMine').mockImplementation(async () => {
      statsStore.byUserId = { ...statsStore.byUserId, me: stats };
      return stats;
    });

    mount(StatsView, {
      global: { plugins: [pinia, router] },
    });

    await flushPromises();

    expect(loadMine).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while stats are being fetched', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/stats');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const statsStore = useStatsStore();
    statsStore.loading = { me: true };
    vi.spyOn(statsStore, 'loadMine').mockImplementation(
      () => new Promise<UserStatsDto>(() => undefined),
    );

    const wrapper = mount(StatsView, {
      global: { plugins: [pinia, router] },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="stats-loading"]').exists()).toBe(true);
    expect(wrapper.get('[role="status"]').exists()).toBe(true);
  });

  it('shows an error message when the load fails', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/stats');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const statsStore = useStatsStore();
    const error = new ApiError({
      status: 500,
      title: 'stats_failed',
      detail: 'Unable to load stats.',
    });
    vi.spyOn(statsStore, 'loadMine').mockImplementation(async () => {
      statsStore.error = error;
      throw error;
    });

    const wrapper = mount(StatsView, {
      global: { plugins: [pinia, router] },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="stats-error"]').text()).toContain('Unable to load stats.');
  });
});

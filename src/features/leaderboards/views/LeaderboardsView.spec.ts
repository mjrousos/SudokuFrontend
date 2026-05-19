import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import LeaderboardsView from './LeaderboardsView.vue';
import { useLeaderboardsStore } from '../store/leaderboardsStore';
import { Difficulty, LeaderboardPeriod } from '@/shared/api/types';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/leaderboards/daily',
        name: 'leaderboards.daily',
        component: { template: '<div />' },
      },
      {
        path: '/leaderboards/:difficulty',
        name: 'leaderboards.byDifficulty',
        component: { template: '<div />' },
      },
    ],
  });
}

async function mountView(
  path: string,
  props: { kind: 'difficulty' | 'daily'; difficulty?: string },
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();

  const store = useLeaderboardsStore();
  const loadSpy = vi.spyOn(store, 'load').mockResolvedValue();

  const wrapper = mount(LeaderboardsView, {
    props,
    global: {
      plugins: [pinia, router],
    },
  });

  await flushPromises();

  return { wrapper, loadSpy };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('LeaderboardsView', () => {
  it('mounting difficulty mode triggers a load call', async () => {
    const { loadSpy } = await mountView('/leaderboards/Easy', {
      kind: 'difficulty',
      difficulty: Difficulty.Easy,
    });

    expect(loadSpy).toHaveBeenCalledWith({
      kind: 'difficulty',
      difficulty: Difficulty.Easy,
      period: LeaderboardPeriod.All,
      pageSize: 20,
    });
  });

  it('switching period triggers a new load call', async () => {
    const { wrapper, loadSpy } = await mountView('/leaderboards/Easy', {
      kind: 'difficulty',
      difficulty: Difficulty.Easy,
    });
    loadSpy.mockClear();

    await wrapper.get('[data-testid="period-tab-Weekly"]').trigger('click');
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith({
      kind: 'difficulty',
      difficulty: Difficulty.Easy,
      period: LeaderboardPeriod.Weekly,
      pageSize: 20,
    });
  });

  it('mounting daily mode triggers a daily load', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { loadSpy } = await mountView('/leaderboards/daily', {
      kind: 'daily',
    });

    expect(loadSpy).toHaveBeenCalledWith({
      kind: 'daily',
      date: today,
      pageSize: 20,
    });
  });
});

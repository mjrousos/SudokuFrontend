import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import PlayView from './PlayView.vue';
import { useGamesStore } from '@/features/game/store/gamesStore';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';
import type { GameViewModel } from '@/shared/sudoku/types';

const GIVENS =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGameViewModel(overrides: Partial<GameViewModel> = {}): GameViewModel {
  return {
    gameId: 'test-game',
    puzzleId: 'p1',
    mode: GameMode.Practice,
    difficulty: Difficulty.Easy,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard: GIVENS,
    grid: decodeBoard(GIVENS, GIVENS),
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: null,
    abandonedAt: null,
    elapsedMs: 0,
    completedElapsedMs: null,
    hintCount: 0,
    mistakeCount: 0,
    isAssisted: false,
    nextMoveNumber: 1,
    ...overrides,
  };
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/play/:gameId', name: 'play', component: { template: '<div />' } },
      { path: '/play/new', name: 'play.new', component: { template: '<div />' } },
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

async function mountView(gameId = 'test-game') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createTestRouter();
  await router.push(`/play/${gameId}`);
  await router.isReady();

  const games = useGamesStore();
  const vm = makeGameViewModel({ gameId });
  const loadSpy = vi.spyOn(games, 'loadGame').mockImplementation(async (id) => {
    games.byId[id] = vm;
    return vm;
  });

  const wrapper = mount(PlayView, {
    props: { gameId },
    global: { plugins: [pinia, router] },
  });

  await flushPromises();

  return { wrapper, games, loadSpy };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PlayView — pause / resume', () => {
  it('renders the board and number pad when not paused', async () => {
    const { wrapper } = await mountView();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="number-pad"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });

  it('hides the board and number pad when paused, shows banner', async () => {
    const { wrapper } = await mountView();

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="number-pad"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(true);
  });

  it('restores the board and number pad after resuming', async () => {
    const { wrapper } = await mountView();

    // Pause
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    // Resume
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="number-pad"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
  };
});

import PlayView from './PlayView.vue';
import { useGamesStore } from '@/features/game/store/gamesStore';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';

const GIVENS =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGameViewModel(gameId = 'g1'): GameViewModel {
  return {
    gameId,
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
  };
}

function mountView(gameId = 'g1') {
  return mount(PlayView, {
    props: { gameId },
    global: {
      stubs: { teleport: true },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockReset();
});

describe('PlayView pause behaviour', () => {
  it('shows the board and number pad when not paused', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockImplementation(async (id) => {
      games.byId = { [id]: vm };
      return vm;
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });

  it('hides the board and number pad when paused, shows the banner', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockImplementation(async (id) => {
      games.byId = { [id]: vm };
      return vm;
    });

    const wrapper = mountView();
    await flushPromises();

    // Pause via the toolbar button
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(true);
  });

  it('restores the board and number pad after resuming', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockImplementation(async (id) => {
      games.byId = { [id]: vm };
      return vm;
    });

    const wrapper = mountView();
    await flushPromises();

    // Pause then resume
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useGamesStore } from '@/features/game/store/gamesStore';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';

import PlayView from './PlayView.vue';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const CURRENT_BOARD =
  '530070000600195000098000060800060003400853001700020006060000280000419005000080079';

function makeGameViewModel(gameId = 'game-1'): GameViewModel {
  return {
    gameId,
    puzzleId: 'puzzle-1',
    mode: GameMode.Practice,
    difficulty: Difficulty.Medium,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard: CURRENT_BOARD,
    grid: decodeBoard(CURRENT_BOARD, GIVENS),
    startedAt: '2024-03-15T00:00:00Z',
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

describe('PlayView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    pushMock.mockReset();
    __resetHttpClientForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetHttpClientForTests();
  });

  it('hides the board while paused and restores it on resume', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockImplementation(async (gameId: string) => {
      games.byId = { ...games.byId, [gameId]: vm };
      return vm;
    });

    const wrapper = mount(PlayView, {
      props: { gameId: vm.gameId },
      global: {
        stubs: { teleport: true },
      },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="cell-4-4"]').text()).toBe('5');

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="paused-banner"]').text()).toBe(
      'Board hidden. Resume to continue.',
    );

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="cell-4-4"]').text()).toBe('5');
  });
});

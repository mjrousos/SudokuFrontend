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
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';

const GIVENS =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const CURRENT_BOARD =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function makeGameViewModel(gameId = 'game-1'): GameViewModel {
  return {
    gameId,
    puzzleId: 'puzzle-1',
    mode: GameMode.Practice,
    difficulty: Difficulty.Easy,
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

function mountView(gameId = 'game-1') {
  return mount(PlayView, {
    props: { gameId },
    global: {
      stubs: {
        AbandonDialog: true,
        CompletionDialog: true,
        NumberPad: {
          template: '<div data-testid="number-pad" />',
        },
        SudokuBoard: {
          template: '<div data-testid="sudoku-board" />',
        },
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockReset();
});

describe('PlayView', () => {
  it('hides the board while paused and restores it on resume', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockImplementation(async (gameId: string) => {
      games.byId = {
        ...games.byId,
        [gameId]: vm,
      };
      return vm;
    });

    const wrapper = mountView(vm.gameId);
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="paused-banner"]').text()).toBe(
      'Board hidden. Resume to continue.',
    );

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);

    wrapper.unmount();
  });
});

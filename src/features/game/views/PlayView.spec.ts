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

function makeGameViewModel(overrides: Partial<GameViewModel> = {}): GameViewModel {
  const currentBoard = overrides.currentBoard ?? GIVENS;
  return {
    gameId: 'g-play',
    puzzleId: 'p-play',
    mode: GameMode.Practice,
    difficulty: Difficulty.Easy,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard,
    grid: decodeBoard(currentBoard, GIVENS),
    startedAt: '2024-03-15T00:00:00Z',
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

describe('PlayView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockReset();
  });

  it('hides the board while paused and restores it when resumed', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    const loadGame = vi.spyOn(games, 'loadGame').mockImplementation(async (gameId: string) => {
      games.byId = { ...games.byId, [gameId]: vm };
      games.currentGameId = gameId;
      return vm;
    });

    const wrapper = mount(PlayView, {
      props: { gameId: 'g-play' },
    });
    await flushPromises();

    expect(loadGame).toHaveBeenCalledWith('g-play');
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="paused-banner"]').text()).toBe(
      'Board hidden. Resume to continue.',
    );

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cell-0-0"]').attributes('data-value')).toBe('5');
  });
});

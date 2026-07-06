import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
  };
});

import PlayView from './PlayView.vue';
import { useGamesStore } from '@/features/game/store/gamesStore';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';
import type { GameViewModel } from '@/shared/sudoku/types';

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

describe('PlayView', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('hides the board while paused and restores it on resume', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel('g-pause');
    vi.spyOn(games, 'loadGame').mockImplementation(async (gameId: string) => {
      games.byId = { ...games.byId, [gameId]: vm };
      games.currentGameId = gameId;
      return vm;
    });

    const wrapper = mount(PlayView, {
      props: { gameId: 'g-pause' },
      global: { plugins: [pinia] },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cell-0-0"]').attributes('data-value')).toBe('5');
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="paused-banner"]').text()).toContain(
      'Board hidden. Resume to continue.',
    );

    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cell-0-0"]').attributes('data-value')).toBe('5');
  });
});

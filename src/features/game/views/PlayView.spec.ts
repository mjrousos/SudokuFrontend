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
import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGameViewModel(overrides: Partial<GameViewModel> = {}): GameViewModel {
  return {
    gameId: 'g-test',
    puzzleId: 'p-test',
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

function authenticate(): void {
  const auth = useAuthStore();
  auth._applyTokens(
    {
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      userId: 'user-1',
      displayName: 'Tester',
    },
    { broadcast: false, persist: false },
  );
}

function mountPlayView(gameId = 'g-test') {
  return mount(PlayView, {
    props: { gameId },
    global: {
      stubs: { teleport: true },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  pushMock.mockReset();
  authenticate();
});

describe('PlayView pause/resume', () => {
  it('hides the board and number pad when paused, shows the paused banner', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockResolvedValue(vm);
    games.byId['g-test'] = vm;

    const wrapper = mountPlayView();
    await flushPromises();

    // Before pausing: board and number pad are visible, no banner
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);

    // Click the pause button
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');

    // After pausing: board and number pad are gone, banner is shown
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="paused-banner"]').text()).toBe(
      'Board hidden. Resume to continue.',
    );
  });

  it('restores the board and number pad when resumed', async () => {
    const games = useGamesStore();
    const vm = makeGameViewModel();
    vi.spyOn(games, 'loadGame').mockResolvedValue(vm);
    games.byId['g-test'] = vm;

    const wrapper = mountPlayView();
    await flushPromises();

    // Pause
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(true);

    // Resume
    await wrapper.get('[data-testid="btn-pause"]').trigger('click');
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });
});

import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
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

import DailyView from './DailyView.vue';
import { useAuthStore } from '@/features/auth/store/authStore';
import { todayUtc, useDailyStore } from '@/features/daily/store/dailyStore';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';
import {
  type DailyPreviewResponse,
  Difficulty,
  GameMode,
  GameStatus,
} from '@/shared/api/types';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makePreview(overrides: Partial<DailyPreviewResponse> = {}): DailyPreviewResponse {
  return {
    date: '2024-03-12',
    difficulty: Difficulty.Medium,
    givens: GIVENS,
    ...overrides,
  };
}

function makeGameViewModel(gameId = 'g-daily'): GameViewModel {
  return {
    gameId,
    puzzleId: 'p-daily',
    mode: GameMode.Daily,
    difficulty: Difficulty.Medium,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard: GIVENS,
    grid: decodeBoard(GIVENS, GIVENS),
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

function mountView() {
  return mount(DailyView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockReset();
});

describe('DailyView', () => {
  it('shows the sign-in prompt when unauthenticated and hides the play CTA', () => {
    const wrapper = mountView();

    expect(wrapper.find('[data-testid="play-today"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sign-in-daily"]').exists()).toBe(true);
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({
      name: 'login',
      query: { redirectTo: '/daily' },
    });
  });

  it('shows the play CTA when authenticated and routes to the game after starting', async () => {
    authenticate();
    const daily = useDailyStore();
    const startToday = vi.spyOn(daily, 'startToday').mockResolvedValue(makeGameViewModel('g-play'));
    const wrapper = mountView();

    await wrapper.get('[data-testid="play-today"]').trigger('click');
    await flushPromises();

    expect(startToday).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith({
      name: 'play.game',
      params: { gameId: 'g-play' },
    });
  });

  it('loads a preview when the date picker changes and renders the board', async () => {
    const daily = useDailyStore();
    const preview = makePreview({ date: '2024-03-10' });
    const loadPreview = vi.spyOn(daily, 'loadPreview').mockImplementation(async (date: string) => {
      daily.previewByDate = {
        ...daily.previewByDate,
        [date]: { ...preview, date },
      };
      daily.unavailableByDate = {
        ...daily.unavailableByDate,
        [date]: false,
      };
      return daily.previewByDate[date] ?? null;
    });
    const wrapper = mountView();

    await wrapper.get('[data-testid="preview-date"]').setValue('2024-03-10');
    await flushPromises();

    expect(loadPreview).toHaveBeenCalledWith('2024-03-10');
    expect(wrapper.get('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Medium');
  });

  it('shows the hidden message when today\'s preview is unavailable', async () => {
    const daily = useDailyStore();
    vi.spyOn(daily, 'loadPreview').mockImplementation(async (date: string) => {
      daily.unavailableByDate = {
        ...daily.unavailableByDate,
        [date]: true,
      };
      return null;
    });
    const wrapper = mountView();

    await wrapper.get('[data-testid="preview-date"]').setValue(todayUtc());
    await flushPromises();

    expect(wrapper.get('[data-testid="preview-unavailable"]').text()).toBe(
      "Today's daily is hidden until you complete or abandon today's game.",
    );
  });
});

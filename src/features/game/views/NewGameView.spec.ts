import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

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

import NewGameView from './NewGameView.vue';
import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { type GameResponse, Difficulty, GameMode, GameStatus } from '@/shared/api/types';

const API = 'http://localhost:8080/api/v1';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGameResponse(overrides: Partial<GameResponse> = {}): GameResponse {
  return {
    gameId: 'g-new',
    puzzleId: 'p-new',
    mode: GameMode.Practice,
    difficulty: Difficulty.Easy,
    status: GameStatus.InProgress,
    givens: GIVENS,
    currentBoard: GIVENS,
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: null,
    abandonedAt: null,
    completedElapsedMs: null,
    elapsedMs: 0,
    hintCount: 0,
    mistakeCount: 0,
    isAssisted: false,
    nextMoveNumber: 1,
    ...overrides,
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
  return mount(NewGameView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });
}

beforeEach(() => {
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  pushMock.mockReset();
});

describe('NewGameView anonymous notice', () => {
  it('shows the anonymous notice and sign-in link when not authenticated', () => {
    const wrapper = mountView();

    expect(wrapper.find('[data-testid="anon-notice"]').exists()).toBe(true);
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.exists()).toBe(true);
    expect(link.props('to')).toEqual({ name: 'login', query: { redirectTo: '/play' } });
  });

  it('hides the anonymous notice when authenticated', () => {
    authenticate();
    const wrapper = mountView();

    expect(wrapper.find('[data-testid="anon-notice"]').exists()).toBe(false);
  });

  it('creates a game and navigates to play when start is clicked', async () => {
    authenticate();
    const game = makeGameResponse();
    server.use(
      http.post(`${API}/games`, () => HttpResponse.json(game, { status: 201 })),
    );
    const wrapper = mountView();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith({
      name: 'play.game',
      params: { gameId: 'g-new' },
    });
  });

  it('creates a game as anonymous user and navigates to play', async () => {
    // anonymous user — no authentication call
    const game = makeGameResponse({ gameId: 'g-anon' });
    server.use(
      http.post(`${API}/games`, () => HttpResponse.json(game, { status: 201 })),
    );
    const wrapper = mountView();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith({
      name: 'play.game',
      params: { gameId: 'g-anon' },
    });
  });
});

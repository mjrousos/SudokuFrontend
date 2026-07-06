import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { setActivePinia, createPinia } from 'pinia';

import PlayView from './PlayView.vue';
import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { Difficulty, GameMode, GameStatus } from '@/shared/api/types';

const API = 'http://localhost:8080/api/v1';
const GAME_ID = 'g1';
const GIVENS =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGameResponse() {
  return {
    gameId: GAME_ID,
    puzzleId: 'p1',
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
  };
}

const server = setupServer(
  http.get(`${API}/games/${GAME_ID}`, () => HttpResponse.json(makeGameResponse())),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function authenticate() {
  const auth = useAuthStore();
  auth._applyTokens(
    {
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000 * 60).toISOString(),
      userId: 'user-1',
      displayName: 'Tester',
    },
    { broadcast: false, persist: false },
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  __resetHttpClientForTests();
  authenticate();
});

describe('PlayView pause behavior', () => {
  it('hides the board and number pad when paused and restores them on resume', async () => {
    const router = createTestRouter();
    const wrapper = mount(PlayView, {
      props: { gameId: GAME_ID },
      global: { plugins: [router] },
    });

    // Wait for loadGame to complete and the view to render the game.
    await flushPromises();

    // Initially the board and number pad are visible; the paused banner is absent.
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);

    // Click the pause button in GameToolbar.
    await wrapper.find('[data-testid="btn-pause"]').trigger('click');

    // Board and number pad must be gone; paused banner must appear.
    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(true);

    // Click resume — board and number pad must come back; banner must disappear.
    await wrapper.find('[data-testid="btn-pause"]').trigger('click');

    expect(wrapper.find('[data-testid="sudoku-board"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pad-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-banner"]').exists()).toBe(false);
  });
});

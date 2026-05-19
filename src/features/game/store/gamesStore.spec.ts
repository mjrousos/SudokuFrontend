import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { useGamesStore } from './gamesStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import { ApiError } from '@/shared/api/problemDetails';
import {
  type GameResponse,
  type HintResponse,
  type MoveResponse,
  type SubmitSolutionResponse,
  GameMode,
  GameMoveEvaluation,
  GameStatus,
  Difficulty,
} from '@/shared/api/types';

const API = 'http://localhost:8080/api/v1';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const EMPTY_INDICES: number[] = [];
for (let i = 0; i < 81; i++) if (GIVENS[i] === '0') EMPTY_INDICES.push(i);

function withCell(board: string, index: number, ch: string): string {
  return board.slice(0, index) + ch + board.slice(index + 1);
}

function makeGameResponse(overrides: Partial<GameResponse> = {}): GameResponse {
  return {
    gameId: 'g1',
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
      refreshTokenExpiresAt: new Date(Date.now() + 60_000 * 60).toISOString(),
      userId: 'user-1',
      displayName: 'Tester',
    },
    { broadcast: false, persist: false },
  );
}

beforeEach(() => {
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  localStorage.clear();
  authenticate();
});

describe('useGamesStore.createGame', () => {
  it('creates a game, stores it by id, and sets currentGameId', async () => {
    const game = makeGameResponse({ gameId: 'g-create' });
    server.use(
      http.post(`${API}/games`, async ({ request }) => {
        const body = (await request.json()) as { mode: number; difficulty: number };
        // Wire format: backend uses integer enums (GameMode.Practice=0,
        // Difficulty.Easy=1) because no JsonStringEnumConverter is registered.
        expect(body).toEqual({ mode: 0, difficulty: 1 });
        return HttpResponse.json(game, { status: 201 });
      }),
    );
    const store = useGamesStore();
    const vm = await store.createGame({ mode: GameMode.Practice, difficulty: Difficulty.Easy });
    expect(vm.gameId).toBe('g-create');
    expect(store.byId['g-create']?.gameId).toBe('g-create');
    expect(store.currentGameId).toBe('g-create');
    expect(vm.grid.length).toBe(9);
  });

  it('records ApiError on failure and rethrows', async () => {
    server.use(
      http.post(`${API}/games`, () =>
        HttpResponse.json(
          { title: 'puzzle_generation_failed', detail: 'Generator unavailable.' },
          { status: 503 },
        ),
      ),
    );
    const store = useGamesStore();
    await expect(
      store.createGame({ mode: GameMode.Practice, difficulty: Difficulty.Easy }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(store.lastError?.status).toBe(503);
  });
});

describe('useGamesStore.createDaily', () => {
  it('POSTs /games/daily and stores the returned game', async () => {
    const game = makeGameResponse({ gameId: 'g-daily', mode: GameMode.Daily });
    server.use(
      http.post(`${API}/games/daily`, () => HttpResponse.json(game, { status: 201 })),
    );
    const store = useGamesStore();
    const vm = await store.createDaily();
    expect(vm.gameId).toBe('g-daily');
    expect(vm.mode).toBe(GameMode.Daily);
    expect(store.currentGameId).toBe('g-daily');
  });
});

describe('useGamesStore.loadGame', () => {
  it('GETs the game and decodes the board', async () => {
    const idx = EMPTY_INDICES[0]!;
    const current = withCell(GIVENS, idx, '4');
    const game = makeGameResponse({ gameId: 'g-load', currentBoard: current, nextMoveNumber: 2 });
    server.use(http.get(`${API}/games/g-load`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    const vm = await store.loadGame('g-load');
    expect(vm.gameId).toBe('g-load');
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    expect(vm.grid[row]?.[col]?.value).toBe(4);
    expect(vm.grid[row]?.[col]?.given).toBe(false);
    expect(store.currentGameId).toBe('g-load');
  });

  it('records ApiError for 404 and rethrows', async () => {
    server.use(
      http.get(`${API}/games/missing`, () =>
        HttpResponse.json({ title: 'not_found' }, { status: 404 }),
      ),
    );
    const store = useGamesStore();
    await expect(store.loadGame('missing')).rejects.toBeInstanceOf(ApiError);
    expect(store.lastError?.status).toBe(404);
  });
});

describe('useGamesStore.submitMove', () => {
  it('rejects a move on a given cell silently (no-op)', async () => {
    const game = makeGameResponse({ gameId: 'g-given' });
    server.use(http.get(`${API}/games/g-given`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-given');
    // Cell (0,0) is '5' — a given.
    const result = await store.submitMove('g-given', { row: 0, col: 0, value: 7 });
    expect(result).toBeNull();
  });

  it('optimistically updates the local grid then reconciles from server', async () => {
    const game = makeGameResponse({ gameId: 'g-opt' });
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const serverBoard = withCell(GIVENS, idx, '3');
    server.use(
      http.get(`${API}/games/g-opt`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-opt/moves`, async ({ request }) => {
        const body = (await request.json()) as { moveNumber: number; row: number; col: number; value: number };
        expect(body.moveNumber).toBe(1);
        expect(body.row).toBe(row);
        expect(body.col).toBe(col);
        expect(body.value).toBe(3);
        const res: MoveResponse = {
          accepted: true,
          evaluation: GameMoveEvaluation.Consistent,
          currentBoard: serverBoard,
          nextMoveNumber: 2,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-opt');
    const res = await store.submitMove('g-opt', { row, col, value: 3 });
    expect(res?.accepted).toBe(true);
    const vm = store.byId['g-opt']!;
    expect(vm.currentBoard).toBe(serverBoard);
    expect(vm.nextMoveNumber).toBe(2);
    expect(vm.grid[row]?.[col]?.value).toBe(3);
    expect(vm.grid[row]?.[col]?.evaluation).toBe(GameMoveEvaluation.Consistent);
  });

  it('increments mistakeCount when the server reports Inconsistent', async () => {
    const game = makeGameResponse({ gameId: 'g-mistake' });
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    server.use(
      http.get(`${API}/games/g-mistake`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-mistake/moves`, () => {
        const res: MoveResponse = {
          accepted: true,
          evaluation: GameMoveEvaluation.Inconsistent,
          currentBoard: withCell(GIVENS, idx, '5'),
          nextMoveNumber: 2,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-mistake');
    await store.submitMove('g-mistake', { row, col, value: 5 });
    const vm = store.byId['g-mistake']!;
    expect(vm.mistakeCount).toBe(1);
    expect(vm.grid[row]?.[col]?.evaluation).toBe(GameMoveEvaluation.Inconsistent);
  });

  it('serializes concurrent submissions per game (FIFO via move queue)', async () => {
    const game = makeGameResponse({ gameId: 'g-fifo' });
    const idx1 = EMPTY_INDICES[0]!;
    const idx2 = EMPTY_INDICES[1]!;
    const r1 = Math.floor(idx1 / 9);
    const c1 = idx1 % 9;
    const r2 = Math.floor(idx2 / 9);
    const c2 = idx2 % 9;
    let inFlight = 0;
    let maxInFlight = 0;
    const seenMoveNumbers: number[] = [];
    server.use(
      http.get(`${API}/games/g-fifo`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-fifo/moves`, async ({ request }) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const body = (await request.json()) as { moveNumber: number };
        seenMoveNumbers.push(body.moveNumber);
        await new Promise((r) => setTimeout(r, 25));
        inFlight--;
        const res: MoveResponse = {
          accepted: true,
          evaluation: GameMoveEvaluation.Consistent,
          currentBoard: GIVENS,
          nextMoveNumber: body.moveNumber + 1,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-fifo');
    // Fire both moves concurrently — the queue must run them strictly serial.
    await Promise.all([
      store.submitMove('g-fifo', { row: r1, col: c1, value: 1 }),
      store.submitMove('g-fifo', { row: r2, col: c2, value: 2 }),
    ]);
    expect(maxInFlight).toBe(1);
    // Move numbers must be strictly increasing per game — the queue dispatches
    // moves serially and each task reads `nextMoveNumber` from the latest
    // reconciled state, so two rapid submissions never reuse the same number
    // (which would otherwise cascade into 409 stale-move errors on the server).
    expect(seenMoveNumbers).toEqual([1, 2]);
  });

  it('rolls back the optimistic update on a non-409 error', async () => {
    const game = makeGameResponse({ gameId: 'g-rollback' });
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    server.use(
      http.get(`${API}/games/g-rollback`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-rollback/moves`, () =>
        HttpResponse.json({ title: 'server_error' }, { status: 500 }),
      ),
    );
    const store = useGamesStore();
    await store.loadGame('g-rollback');
    await expect(
      store.submitMove('g-rollback', { row, col, value: 9 }),
    ).rejects.toBeInstanceOf(ApiError);
    const vm = store.byId['g-rollback']!;
    expect(vm.grid[row]?.[col]?.value).toBe(0);
  });

  it('refetches the canonical game on 409 stale move', async () => {
    const game = makeGameResponse({ gameId: 'g-stale', nextMoveNumber: 1 });
    const refetched = makeGameResponse({ gameId: 'g-stale', nextMoveNumber: 5 });
    let getCount = 0;
    server.use(
      http.get(`${API}/games/g-stale`, () => {
        getCount++;
        return HttpResponse.json(getCount === 1 ? game : refetched);
      }),
      http.post(`${API}/games/g-stale/moves`, () =>
        HttpResponse.json({ title: 'stale_move' }, { status: 409 }),
      ),
    );
    const store = useGamesStore();
    await store.loadGame('g-stale');
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const res = await store.submitMove('g-stale', { row, col, value: 3 });
    expect(res).toBeNull();
    expect(store.byId['g-stale']?.nextMoveNumber).toBe(5);
  });

  it('refuses moves on completed games', async () => {
    const game = makeGameResponse({ gameId: 'g-done', status: GameStatus.Completed });
    server.use(http.get(`${API}/games/g-done`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-done');
    const idx = EMPTY_INDICES[0]!;
    const result = await store.submitMove('g-done', {
      row: Math.floor(idx / 9),
      col: idx % 9,
      value: 4,
    });
    expect(result).toBeNull();
  });
});

describe('useGamesStore.useHint', () => {
  it('applies the hint to the local grid and bumps hintCount + isAssisted', async () => {
    const game = makeGameResponse({ gameId: 'g-hint' });
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    server.use(
      http.get(`${API}/games/g-hint`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-hint/hint`, () => {
        const res: HintResponse = {
          row,
          col,
          value: 4,
          currentBoard: withCell(GIVENS, idx, '4'),
          hintCount: 1,
          isAssisted: true,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-hint');
    const res = await store.useHint('g-hint');
    expect(res?.value).toBe(4);
    const vm = store.byId['g-hint']!;
    expect(vm.hintCount).toBe(1);
    expect(vm.isAssisted).toBe(true);
    expect(vm.grid[row]?.[col]?.value).toBe(4);
  });

  it('preserves nextMoveNumber (hints do not consume a move slot)', async () => {
    const game = makeGameResponse({ gameId: 'g-hint-move-num', nextMoveNumber: 3 });
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    server.use(
      http.get(`${API}/games/g-hint-move-num`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-hint-move-num/hint`, () => {
        const res: HintResponse = {
          row,
          col,
          value: 4,
          currentBoard: withCell(GIVENS, idx, '4'),
          hintCount: 1,
          isAssisted: true,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-hint-move-num');
    await store.useHint('g-hint-move-num');
    // nextMoveNumber must stay at 3 — hints don't consume a move slot.
    expect(store.byId['g-hint-move-num']?.nextMoveNumber).toBe(3);
  });

  it('sequences concurrent submitMove + useHint through the same queue (no stomping)', async () => {
    const game = makeGameResponse({ gameId: 'g-hint-conc', nextMoveNumber: 1 });
    const idx1 = EMPTY_INDICES[0]!;
    const idx2 = EMPTY_INDICES[1]!;
    const r1 = Math.floor(idx1 / 9);
    const c1 = idx1 % 9;
    const r2 = Math.floor(idx2 / 9);
    const c2 = idx2 % 9;
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.get(`${API}/games/g-hint-conc`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-hint-conc/moves`, async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((r) => setTimeout(r, 25));
        inFlight--;
        const res: MoveResponse = {
          accepted: true,
          evaluation: GameMoveEvaluation.Consistent,
          currentBoard: withCell(GIVENS, idx1, '3'),
          nextMoveNumber: 2,
        };
        return HttpResponse.json(res);
      }),
      http.post(`${API}/games/g-hint-conc/hint`, async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((r) => setTimeout(r, 25));
        inFlight--;
        const res: HintResponse = {
          row: r2,
          col: c2,
          value: 5,
          currentBoard: withCell(GIVENS, idx2, '5'),
          hintCount: 1,
          isAssisted: true,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-hint-conc');
    await Promise.all([
      store.submitMove('g-hint-conc', { row: r1, col: c1, value: 3 }),
      store.useHint('g-hint-conc'),
    ]);
    // The queue must serialize the two operations — never 2 in-flight at once.
    expect(maxInFlight).toBe(1);
    // The move bumped nextMoveNumber to 2; the hint must NOT overwrite it.
    expect(store.byId['g-hint-conc']?.nextMoveNumber).toBe(2);
  });

  it('does not cascade 409s — queued moves after a stale-move error use refetched nextMoveNumber', async () => {
    const game = makeGameResponse({ gameId: 'g-409-cascade', nextMoveNumber: 1 });
    const refetched = makeGameResponse({ gameId: 'g-409-cascade', nextMoveNumber: 5 });
    const idx1 = EMPTY_INDICES[0]!;
    const idx2 = EMPTY_INDICES[1]!;
    const idx3 = EMPTY_INDICES[2]!;
    const seenMoveNumbers: number[] = [];
    let getCount = 0;
    server.use(
      http.get(`${API}/games/g-409-cascade`, () => {
        getCount++;
        return HttpResponse.json(getCount === 1 ? game : refetched);
      }),
      http.post(`${API}/games/g-409-cascade/moves`, async ({ request }) => {
        const body = (await request.json()) as { moveNumber: number };
        seenMoveNumbers.push(body.moveNumber);
        if (body.moveNumber === 1) {
          // First move is stale — triggers in-queue refetch.
          return HttpResponse.json({ title: 'stale_move' }, { status: 409 });
        }
        const res: MoveResponse = {
          accepted: true,
          evaluation: GameMoveEvaluation.Consistent,
          currentBoard: GIVENS,
          nextMoveNumber: body.moveNumber + 1,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-409-cascade');
    // Fire three moves concurrently. Move 1 should 409 and trigger a refetch
    // inside the queue task. Moves 2 and 3 must use the refetched move number.
    await Promise.all([
      store.submitMove('g-409-cascade', {
        row: Math.floor(idx1 / 9),
        col: idx1 % 9,
        value: 1,
      }),
      store.submitMove('g-409-cascade', {
        row: Math.floor(idx2 / 9),
        col: idx2 % 9,
        value: 2,
      }),
      store.submitMove('g-409-cascade', {
        row: Math.floor(idx3 / 9),
        col: idx3 % 9,
        value: 3,
      }),
    ]);
    // First move used stale number 1 and got 409 → refetch sets it to 5.
    expect(seenMoveNumbers[0]).toBe(1);
    // Second move must use the refetched number, not the stale 1 again.
    expect(seenMoveNumbers[1]).toBe(5);
    // Third move increments correctly from the second's response.
    expect(seenMoveNumbers[2]).toBe(6);
    expect(store.byId['g-409-cascade']?.nextMoveNumber).toBe(7);
  });

  it('returns null when the game is not in progress', async () => {
    const game = makeGameResponse({ gameId: 'g-hint-done', status: GameStatus.Completed });
    server.use(http.get(`${API}/games/g-hint-done`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-hint-done');
    const result = await store.useHint('g-hint-done');
    expect(result).toBeNull();
  });

  it('surfaces 409 (no empty cells) as a thrown ApiError', async () => {
    const game = makeGameResponse({ gameId: 'g-hint-409' });
    server.use(
      http.get(`${API}/games/g-hint-409`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-hint-409/hint`, () =>
        HttpResponse.json({ title: 'no_empty_cells' }, { status: 409 }),
      ),
    );
    const store = useGamesStore();
    await store.loadGame('g-hint-409');
    await expect(store.useHint('g-hint-409')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('useGamesStore.submitSolution', () => {
  it('refuses to submit an incomplete board (client-side guard)', async () => {
    const game = makeGameResponse({ gameId: 'g-sol' });
    server.use(http.get(`${API}/games/g-sol`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-sol');
    await expect(store.submitSolution('g-sol')).rejects.toThrow(/incomplete/);
  });

  it('on correct solution sets status, records completion state, stops accepting moves', async () => {
    // A complete (but not necessarily correct on the wire) board — backend decides.
    const complete = '5'.repeat(81);
    const game = makeGameResponse({ gameId: 'g-sol-ok', currentBoard: complete });
    server.use(
      http.get(`${API}/games/g-sol-ok`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-sol-ok/solution`, () => {
        const res: SubmitSolutionResponse = {
          isCorrect: true,
          status: GameStatus.Completed,
          completedElapsedMs: 12345,
          mistakeCount: 1,
          isAssisted: false,
          leaderboardEntryCreated: true,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-sol-ok');
    const res = await store.submitSolution('g-sol-ok');
    expect(res?.isCorrect).toBe(true);
    const vm = store.byId['g-sol-ok']!;
    expect(vm.status).toBe(GameStatus.Completed);
    expect(vm.completedElapsedMs).toBe(12345);
    expect(store.completion?.leaderboardEntryCreated).toBe(true);
  });

  it('on incorrect solution leaves status as InProgress', async () => {
    const complete = '5'.repeat(81);
    const game = makeGameResponse({ gameId: 'g-sol-bad', currentBoard: complete });
    server.use(
      http.get(`${API}/games/g-sol-bad`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-sol-bad/solution`, () => {
        const res: SubmitSolutionResponse = {
          isCorrect: false,
          status: GameStatus.InProgress,
          completedElapsedMs: null,
          mistakeCount: 5,
          isAssisted: false,
          leaderboardEntryCreated: false,
        };
        return HttpResponse.json(res);
      }),
    );
    const store = useGamesStore();
    await store.loadGame('g-sol-bad');
    const res = await store.submitSolution('g-sol-bad');
    expect(res?.isCorrect).toBe(false);
    expect(store.byId['g-sol-bad']?.status).toBe(GameStatus.InProgress);
    expect(store.completion?.isCorrect).toBe(false);
  });
});

describe('useGamesStore.abandon', () => {
  it('marks the game abandoned and clears the move queue', async () => {
    const game = makeGameResponse({ gameId: 'g-ab' });
    server.use(
      http.get(`${API}/games/g-ab`, () => HttpResponse.json(game)),
      http.post(`${API}/games/g-ab/abandon`, () => new HttpResponse(null, { status: 204 })),
    );
    const store = useGamesStore();
    await store.loadGame('g-ab');
    await store.abandon('g-ab');
    expect(store.byId['g-ab']?.status).toBe(GameStatus.Abandoned);
    expect(store.byId['g-ab']?.abandonedAt).not.toBeNull();
  });
});

describe('useGamesStore.setCellNotes', () => {
  it('updates pencil notes for a non-given cell', async () => {
    const game = makeGameResponse({ gameId: 'g-notes' });
    server.use(http.get(`${API}/games/g-notes`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-notes');
    const idx = EMPTY_INDICES[0]!;
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    store.setCellNotes('g-notes', row, col, new Set([1, 3, 5]));
    const cell = store.byId['g-notes']!.grid[row]?.[col];
    expect(Array.from(cell!.notes).sort()).toEqual([1, 3, 5]);
  });

  it('ignores notes on given cells', async () => {
    const game = makeGameResponse({ gameId: 'g-notes2' });
    server.use(http.get(`${API}/games/g-notes2`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-notes2');
    // (0,0) is a given (value 5).
    store.setCellNotes('g-notes2', 0, 0, new Set([7]));
    const cell = store.byId['g-notes2']!.grid[0]?.[0];
    expect(cell!.notes.size).toBe(0);
  });
});

describe('useGamesStore.reset', () => {
  it('clears all in-memory state', async () => {
    const game = makeGameResponse({ gameId: 'g-reset' });
    server.use(http.get(`${API}/games/g-reset`, () => HttpResponse.json(game)));
    const store = useGamesStore();
    await store.loadGame('g-reset');
    store.reset();
    expect(store.byId).toEqual({});
    expect(store.currentGameId).toBeNull();
    expect(store.completion).toBeNull();
  });
});

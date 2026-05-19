import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { gamesApi } from '../api/gamesApi';
import { createMoveQueue, type MoveQueue } from '../logic/moveQueue';
import { ApiError } from '@/shared/api/problemDetails';
import type {
  CreateGameRequest,
  GameResponse,
  HintResponse,
  MoveResponse,
  SubmitSolutionResponse,
} from '@/shared/api/types';
import { GameMoveEvaluation, GameStatus } from '@/shared/api/types';
import { decodeBoard, isComplete, setCellValue } from '@/shared/sudoku/boardCodec';
import type { GameViewModel } from '@/shared/sudoku/types';

interface PendingMove {
  row: number;
  col: number;
  value: number;
}

interface CompletionState {
  gameId: string;
  isCorrect: boolean;
  status: GameStatus;
  completedElapsedMs: number | null;
  mistakeCount: number;
  isAssisted: boolean;
  leaderboardEntryCreated: boolean;
}

export const useGamesStore = defineStore('games', () => {
  const byId = ref<Record<string, GameViewModel>>({});
  const moveQueues = new Map<string, MoveQueue>();
  const currentGameId = ref<string | null>(null);
  const loading = ref<Record<string, boolean>>({});
  const lastError = ref<ApiError | null>(null);
  const completion = ref<CompletionState | null>(null);

  const current = computed<GameViewModel | null>(() =>
    currentGameId.value ? byId.value[currentGameId.value] ?? null : null,
  );

  function projectGame(res: GameResponse): GameViewModel {
    return {
      gameId: res.gameId,
      puzzleId: res.puzzleId,
      mode: res.mode,
      difficulty: res.difficulty,
      status: res.status,
      givens: res.givens,
      currentBoard: res.currentBoard,
      grid: decodeBoard(res.currentBoard, res.givens),
      startedAt: res.startedAt,
      completedAt: res.completedAt,
      abandonedAt: res.abandonedAt,
      elapsedMs: res.elapsedMs,
      completedElapsedMs: res.completedElapsedMs,
      hintCount: res.hintCount,
      mistakeCount: res.mistakeCount,
      isAssisted: res.isAssisted,
      nextMoveNumber: res.nextMoveNumber,
    };
  }

  function upsert(res: GameResponse): GameViewModel {
    const vm = projectGame(res);
    byId.value = { ...byId.value, [vm.gameId]: vm };
    return vm;
  }

  function queueFor(gameId: string): MoveQueue {
    let q = moveQueues.get(gameId);
    if (!q) {
      q = createMoveQueue();
      moveQueues.set(gameId, q);
    }
    return q;
  }

  async function loadGame(gameId: string): Promise<GameViewModel> {
    loading.value = { ...loading.value, [gameId]: true };
    try {
      const res = await gamesApi.get(gameId);
      const vm = upsert(res);
      currentGameId.value = gameId;
      return vm;
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    } finally {
      loading.value = { ...loading.value, [gameId]: false };
    }
  }

  async function createGame(req: CreateGameRequest): Promise<GameViewModel> {
    try {
      const res = await gamesApi.create(req);
      const vm = upsert(res);
      currentGameId.value = vm.gameId;
      return vm;
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  async function createDaily(): Promise<GameViewModel> {
    try {
      const res = await gamesApi.createDaily();
      const vm = upsert(res);
      currentGameId.value = vm.gameId;
      return vm;
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  /**
   * Enqueue a move on the per-game serial queue. The local board is updated
   * optimistically (so the keystroke renders immediately); after the server
   * responds we reconcile the local grid against `currentBoard` and stamp the
   * cell with `evaluation` so the UI can mark inconsistencies.
   *
   * On 409 stale move (concurrent submitter or out-of-sync nextMoveNumber)
   * we refetch the canonical state.
   */
  async function submitMove(gameId: string, move: PendingMove): Promise<MoveResponse | null> {
    const vm = byId.value[gameId];
    if (!vm) throw new Error(`Unknown game ${gameId}`);
    if (vm.status !== GameStatus.InProgress) return null;
    const target = vm.grid[move.row]?.[move.col];
    if (!target) throw new RangeError('move out of bounds');
    if (target.given) return null;

    // Optimistic local update
    const prevValue = target.value;
    const prevEval = target.evaluation;
    const mutable = vm.grid.map((r) => r.slice());
    setCellValue(mutable, move.row, move.col, move.value);
    byId.value = {
      ...byId.value,
      [gameId]: { ...vm, grid: mutable },
    };

    const q = queueFor(gameId);
    try {
      // Read `nextMoveNumber` AND reconcile the response inside the queued
      // task so the next task sees the updated `nextMoveNumber` before it
      // starts. (If reconciliation lived in a `.then` after `q.enqueue`, the
      // queue's drain loop would dispatch the next task in the same microtask
      // turn and all rapid submissions would race on a stale number.)
      const res = await q.enqueue(async () => {
        const latest = byId.value[gameId];
        const moveNumber = latest?.nextMoveNumber ?? vm.nextMoveNumber;
        try {
          const response = await gamesApi.applyMove(gameId, {
            moveNumber,
            row: move.row,
            col: move.col,
            value: move.value,
          });
          applyMoveResponse(gameId, response, move);
          return response;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            // Refetch canonical state INSIDE the queued task so the next
            // task sees the refreshed nextMoveNumber before it starts.
            try {
              await loadGame(gameId);
            } catch {
              // Best-effort.
            }
            return null;
          }
          throw err;
        }
      });
      return res;
    } catch (err) {
      // Roll back optimistic update on non-409 errors.
      const current = byId.value[gameId];
      if (current) {
        const rolled = current.grid.map((r) => r.slice());
        if (rolled[move.row] && rolled[move.row]![move.col]) {
          rolled[move.row]![move.col] = {
            ...rolled[move.row]![move.col]!,
            value: prevValue,
            evaluation: prevEval,
          };
        }
        byId.value = { ...byId.value, [gameId]: { ...current, grid: rolled } };
      }
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  function applyMoveResponse(gameId: string, res: MoveResponse, move: PendingMove): void {
    const vm = byId.value[gameId];
    if (!vm) return;
    const grid = decodeBoard(res.currentBoard, vm.givens);
    const cell = grid[move.row]?.[move.col];
    if (cell) cell.evaluation = res.evaluation;
    byId.value = {
      ...byId.value,
      [gameId]: {
        ...vm,
        currentBoard: res.currentBoard,
        grid,
        nextMoveNumber: res.nextMoveNumber,
        mistakeCount:
          res.evaluation === GameMoveEvaluation.Inconsistent
            ? vm.mistakeCount + 1
            : vm.mistakeCount,
      },
    };
  }

  async function useHint(gameId: string): Promise<HintResponse | null> {
    const vm = byId.value[gameId];
    if (!vm || vm.status !== GameStatus.InProgress) return null;
    try {
      // Route through the per-game queue so hint and moves don't race.
      return await queueFor(gameId).enqueue(async () => {
        const res = await gamesApi.hint(gameId);
        // Re-read after await to avoid overwriting state mutated by a
        // concurrent move that resolved while the hint request was in flight.
        const latest = byId.value[gameId];
        if (!latest) return res;
        const grid = decodeBoard(res.currentBoard, latest.givens);
        const cell = grid[res.row]?.[res.col];
        if (cell) cell.evaluation = GameMoveEvaluation.Consistent;
        byId.value = {
          ...byId.value,
          [gameId]: {
            ...latest,
            currentBoard: res.currentBoard,
            grid,
            hintCount: res.hintCount,
            isAssisted: res.isAssisted,
            // nextMoveNumber is intentionally NOT updated: hints do not
            // consume a move slot, so the next manual move must still use
            // the same nextMoveNumber that the server expects.
          },
        };
        return res;
      });
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  async function submitSolution(gameId: string): Promise<SubmitSolutionResponse | null> {
    const vm = byId.value[gameId];
    if (!vm) return null;
    if (!isComplete(vm.currentBoard)) {
      throw new Error('Cannot submit an incomplete board.');
    }
    try {
      const res = await gamesApi.submitSolution(gameId, { board: vm.currentBoard });
      byId.value = {
        ...byId.value,
        [gameId]: {
          ...vm,
          status: res.status,
          completedElapsedMs: res.completedElapsedMs,
          mistakeCount: res.mistakeCount,
          isAssisted: res.isAssisted,
          completedAt:
            res.status === GameStatus.Completed
              ? new Date().toISOString()
              : vm.completedAt,
        },
      };
      completion.value = {
        gameId,
        isCorrect: res.isCorrect,
        status: res.status,
        completedElapsedMs: res.completedElapsedMs,
        mistakeCount: res.mistakeCount,
        isAssisted: res.isAssisted,
        leaderboardEntryCreated: res.leaderboardEntryCreated,
      };
      return res;
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  async function abandon(gameId: string): Promise<void> {
    const vm = byId.value[gameId];
    if (!vm) return;
    try {
      await gamesApi.abandon(gameId);
      byId.value = {
        ...byId.value,
        [gameId]: {
          ...vm,
          status: GameStatus.Abandoned,
          abandonedAt: new Date().toISOString(),
        },
      };
      moveQueues.get(gameId)?.clear(new Error('Game abandoned.'));
    } catch (err) {
      if (err instanceof ApiError) lastError.value = err;
      throw err;
    }
  }

  function setCellNotes(gameId: string, row: number, col: number, notes: Set<number>): void {
    const vm = byId.value[gameId];
    if (!vm) return;
    const grid = vm.grid.map((r) => r.slice());
    const cell = grid[row]?.[col];
    if (!cell || cell.given) return;
    grid[row]![col] = { ...cell, notes: new Set(notes) };
    byId.value = { ...byId.value, [gameId]: { ...vm, grid } };
  }

  function clearCompletion(): void {
    completion.value = null;
  }

  function reset(): void {
    byId.value = {};
    moveQueues.clear();
    currentGameId.value = null;
    loading.value = {};
    lastError.value = null;
    completion.value = null;
  }

  return {
    byId,
    currentGameId,
    current,
    loading,
    lastError,
    completion,
    loadGame,
    createGame,
    createDaily,
    submitMove,
    useHint,
    submitSolution,
    abandon,
    setCellNotes,
    clearCompletion,
    reset,
    // exposed for tests
    _projectGame: projectGame,
    _queueFor: queueFor,
  };
});

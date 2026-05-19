import type { Difficulty, GameMoveEvaluation } from '@/shared/api/types';

/**
 * In-memory representation of a single Sudoku cell. Givens are immutable
 * (set by the puzzle); entries are user-provided. The wire format is an
 * 81-character digit string where `0` means empty.
 */
export interface Cell {
  row: number;
  col: number;
  value: number; // 0 = empty
  given: boolean;
  /** Last server evaluation for this cell, if any. */
  evaluation?: GameMoveEvaluation | undefined;
  /** Pencil-mark candidates (client-only). */
  notes: ReadonlySet<number>;
}

export type Grid = ReadonlyArray<ReadonlyArray<Cell>>;
export type MutableGrid = Cell[][];

export const BOARD_SIZE = 9;
export const BOX_SIZE = 3;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export interface GameViewModel {
  gameId: string;
  puzzleId: string;
  mode: import('@/shared/api/types').GameMode;
  difficulty: Difficulty;
  status: import('@/shared/api/types').GameStatus;
  givens: string;
  currentBoard: string;
  grid: Grid;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  elapsedMs: number;
  completedElapsedMs: number | null;
  hintCount: number;
  mistakeCount: number;
  isAssisted: boolean;
  nextMoveNumber: number;
}

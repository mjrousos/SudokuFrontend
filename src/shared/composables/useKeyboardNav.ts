import { BOARD_SIZE } from '@/shared/sudoku/types';

export type DirectionKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Returns the next cell coordinate after moving the cursor in `dir`, clamped to the board. */
export function moveCursor(
  position: [number, number],
  dir: DirectionKey,
): [number, number] {
  const [row, col] = position;
  switch (dir) {
    case 'ArrowUp':
      return [Math.max(0, row - 1), col];
    case 'ArrowDown':
      return [Math.min(BOARD_SIZE - 1, row + 1), col];
    case 'ArrowLeft':
      return [row, Math.max(0, col - 1)];
    case 'ArrowRight':
      return [row, Math.min(BOARD_SIZE - 1, col + 1)];
  }
}

/**
 * Parse a keyboard event into a logical board action. Returns null if the
 * event has no meaning to the board (modifier-only, irrelevant keys).
 */
export type BoardAction =
  | { kind: 'move'; dir: DirectionKey }
  | { kind: 'digit'; value: number }
  | { kind: 'clear' }
  | { kind: 'pencil-toggle' };

export function parseKeyEvent(e: KeyboardEvent): BoardAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    return { kind: 'move', dir: k };
  }
  if (/^[1-9]$/.test(k)) return { kind: 'digit', value: Number(k) };
  if (k === '0' || k === 'Delete' || k === 'Backspace') return { kind: 'clear' };
  if (k === 'n' || k === 'N' || k === 'p' || k === 'P') return { kind: 'pencil-toggle' };
  return null;
}

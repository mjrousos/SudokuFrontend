import { BOARD_SIZE, BOX_SIZE, type Grid } from './types';

/**
 * Identify every cell that violates Sudoku constraints: a non-zero value
 * that appears more than once in its row, column, or 3x3 box.
 *
 * Returns a Set of `${row},${col}` keys for O(1) per-cell lookup in views.
 * Givens are included if they conflict (which shouldn't happen with a valid
 * puzzle but we don't assume).
 */
export function findConflicts(grid: Grid): Set<string> {
  const conflicts = new Set<string>();

  // Rows
  for (let row = 0; row < BOARD_SIZE; row++) {
    markGroupConflicts(grid, conflicts, (i) => [row, i]);
  }
  // Columns
  for (let col = 0; col < BOARD_SIZE; col++) {
    markGroupConflicts(grid, conflicts, (i) => [i, col]);
  }
  // 3x3 boxes
  for (let boxRow = 0; boxRow < BOX_SIZE; boxRow++) {
    for (let boxCol = 0; boxCol < BOX_SIZE; boxCol++) {
      markGroupConflicts(grid, conflicts, (i) => [
        boxRow * BOX_SIZE + Math.floor(i / BOX_SIZE),
        boxCol * BOX_SIZE + (i % BOX_SIZE),
      ]);
    }
  }

  return conflicts;
}

function markGroupConflicts(
  grid: Grid,
  out: Set<string>,
  coord: (i: number) => [number, number],
): void {
  const seen = new Map<number, [number, number][]>();
  for (let i = 0; i < BOARD_SIZE; i++) {
    const [r, c] = coord(i);
    const v = grid[r]?.[c]?.value ?? 0;
    if (v === 0) continue;
    const list = seen.get(v) ?? [];
    list.push([r, c]);
    seen.set(v, list);
  }
  for (const list of seen.values()) {
    if (list.length > 1) {
      for (const [r, c] of list) out.add(`${r},${c}`);
    }
  }
}

export interface PeerHighlight {
  selected: [number, number] | null;
  selectedValue: number;
  peers: Set<string>;
  sameValue: Set<string>;
}

/**
 * Cells in the same row/column/box as the selected cell, plus the cells
 * sharing its non-zero value. Used by SudokuBoard for highlighting.
 */
export function computeHighlight(
  grid: Grid,
  selected: [number, number] | null,
): PeerHighlight {
  const peers = new Set<string>();
  const sameValue = new Set<string>();
  if (!selected) return { selected: null, selectedValue: 0, peers, sameValue };
  const [sr, sc] = selected;
  const cell = grid[sr]?.[sc];
  if (!cell) return { selected: null, selectedValue: 0, peers, sameValue };
  const sv = cell.value;
  const boxRow = Math.floor(sr / BOX_SIZE) * BOX_SIZE;
  const boxCol = Math.floor(sc / BOX_SIZE) * BOX_SIZE;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (r === sr || c === sc || (r >= boxRow && r < boxRow + BOX_SIZE && c >= boxCol && c < boxCol + BOX_SIZE)) {
        peers.add(`${r},${c}`);
      }
      const v = grid[r]?.[c]?.value ?? 0;
      if (sv !== 0 && v === sv) sameValue.add(`${r},${c}`);
    }
  }
  return { selected, selectedValue: sv, peers, sameValue };
}

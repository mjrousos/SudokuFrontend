import { BOARD_SIZE, CELL_COUNT, type Cell, type MutableGrid } from './types';

/**
 * Parse an 81-character digit string into a 9x9 grid. Each cell records the
 * value and whether it was a given (immutable). Given-ness is derived from
 * the puzzle's `givens` string; the current board is layered on top.
 */
export function decodeBoard(currentBoard: string, givens: string): MutableGrid {
  if (currentBoard.length !== CELL_COUNT) {
    throw new RangeError(
      `currentBoard must be ${CELL_COUNT} chars, got ${currentBoard.length}`,
    );
  }
  if (givens.length !== CELL_COUNT) {
    throw new RangeError(`givens must be ${CELL_COUNT} chars, got ${givens.length}`);
  }
  if (!isDigitString(currentBoard)) {
    throw new RangeError('currentBoard must be digits only (0-9).');
  }
  if (!isDigitString(givens)) {
    throw new RangeError('givens must be digits only (0-9).');
  }

  const grid: MutableGrid = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const r: Cell[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      const idx = row * BOARD_SIZE + col;
      const value = digitAt(currentBoard, idx);
      const givenValue = digitAt(givens, idx);
      r.push({
        row,
        col,
        value,
        given: givenValue !== 0,
        notes: new Set<number>(),
      });
    }
    grid.push(r);
  }
  return grid;
}

/** Convert a grid back to an 81-character digit string. */
export function encodeBoard(grid: ReadonlyArray<ReadonlyArray<Cell>>): string {
  if (grid.length !== BOARD_SIZE) {
    throw new RangeError(`grid must have ${BOARD_SIZE} rows, got ${grid.length}`);
  }
  let out = '';
  for (let row = 0; row < BOARD_SIZE; row++) {
    const r = grid[row]!;
    if (r.length !== BOARD_SIZE) {
      throw new RangeError(`grid row ${row} must have ${BOARD_SIZE} cells.`);
    }
    for (let col = 0; col < BOARD_SIZE; col++) {
      const v = r[col]!.value;
      if (!Number.isInteger(v) || v < 0 || v > 9) {
        throw new RangeError(`grid[${row}][${col}] value must be 0-9, got ${v}`);
      }
      out += String(v);
    }
  }
  return out;
}

/** True iff the board has no empty cells. */
export function isComplete(board: string): boolean {
  return board.length === CELL_COUNT && !board.includes('0');
}

export function isDigitString(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function digitAt(s: string, i: number): number {
  return s.charCodeAt(i) - 48;
}

/** Update a single cell value in-place, preserving immutability of givens. */
export function setCellValue(grid: MutableGrid, row: number, col: number, value: number): void {
  const cell = grid[row]?.[col];
  if (!cell) throw new RangeError(`cell ${row},${col} out of bounds`);
  if (cell.given) throw new Error(`cannot mutate given cell ${row},${col}`);
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new RangeError(`value must be 0-9, got ${value}`);
  }
  cell.value = value;
}

export function getCell(grid: ReadonlyArray<ReadonlyArray<Cell>>, row: number, col: number): Cell {
  const cell = grid[row]?.[col];
  if (!cell) throw new RangeError(`cell ${row},${col} out of bounds`);
  return cell;
}

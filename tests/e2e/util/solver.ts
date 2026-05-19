/**
 * Deterministic Sudoku solver. Returns the solved 81-char string, or null if
 * the puzzle is unsolvable. Backtracking with bit-mask candidate sets — fast
 * enough for the puzzle sizes the backend hands out (verified up to Expert).
 *
 * We use this in E2E specs so we never have to read the canonical solution
 * from the backend (which deliberately doesn't expose it).
 */

const N = 9;

export function solveSudoku(board: string): string | null {
  if (board.length !== 81) throw new RangeError('board must be 81 chars');
  const grid = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const c = board.charCodeAt(i) - 48;
    if (c < 0 || c > 9) throw new RangeError('board must be digits 0-9');
    grid[i] = c;
  }
  const rows = new Uint16Array(N);
  const cols = new Uint16Array(N);
  const boxes = new Uint16Array(N);

  for (let i = 0; i < 81; i++) {
    const v = grid[i]!;
    if (v === 0) continue;
    const r = Math.floor(i / N);
    const c = i % N;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const bit = 1 << v;
    if (rows[r]! & bit || cols[c]! & bit || boxes[b]! & bit) return null;
    rows[r]! |= bit;
    cols[c]! |= bit;
    boxes[b]! |= bit;
  }

  function nextEmpty(): number {
    // Most-constrained-variable heuristic: pick the empty cell with the
    // fewest candidates. Dramatically faster than left-to-right scan.
    let bestIdx = -1;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]! !== 0) continue;
      const r = Math.floor(i / N);
      const c = i % N;
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const used = rows[r]! | cols[c]! | boxes[b]!;
      let count = 0;
      for (let v = 1; v <= 9; v++) if (!(used & (1 << v))) count++;
      if (count < bestCount) {
        bestCount = count;
        bestIdx = i;
        if (count <= 1) break;
      }
    }
    return bestIdx;
  }

  function recurse(): boolean {
    const idx = nextEmpty();
    if (idx === -1) return true; // solved
    const r = Math.floor(idx / N);
    const c = idx % N;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const used = rows[r]! | cols[c]! | boxes[b]!;
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      if (used & bit) continue;
      grid[idx] = v;
      rows[r]! |= bit;
      cols[c]! |= bit;
      boxes[b]! |= bit;
      if (recurse()) return true;
      grid[idx] = 0;
      rows[r]! &= ~bit;
      cols[c]! &= ~bit;
      boxes[b]! &= ~bit;
    }
    return false;
  }

  if (!recurse()) return null;
  let out = '';
  for (let i = 0; i < 81; i++) out += String(grid[i]!);
  return out;
}

/**
 * Diff two 81-char boards as a list of (row, col, value) tuples — values that
 * appear in `target` but were `0` in `from`. Useful for replaying a solution.
 */
export function diffFills(
  from: string,
  target: string,
): Array<{ row: number; col: number; value: number }> {
  if (from.length !== 81 || target.length !== 81) {
    throw new RangeError('boards must be 81 chars');
  }
  const fills: Array<{ row: number; col: number; value: number }> = [];
  for (let i = 0; i < 81; i++) {
    if (from[i] === '0' && target[i] !== '0') {
      fills.push({
        row: Math.floor(i / N),
        col: i % N,
        value: Number(target[i]),
      });
    }
  }
  return fills;
}

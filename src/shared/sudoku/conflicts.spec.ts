import { describe, expect, it } from 'vitest';

import { decodeBoard } from '@/shared/sudoku/boardCodec';
import { computeHighlight, findConflicts } from '@/shared/sudoku/conflicts';

const NO_GIVENS = '0'.repeat(81);

describe('findConflicts', () => {
  it('returns an empty set for an empty grid', () => {
    const grid = decodeBoard(NO_GIVENS, NO_GIVENS);
    expect(findConflicts(grid).size).toBe(0);
  });

  it('flags row duplicates', () => {
    const board = NO_GIVENS.split('');
    board[0] = '5';
    board[8] = '5';
    const grid = decodeBoard(board.join(''), NO_GIVENS);
    expect(findConflicts(grid)).toEqual(new Set(['0,0', '0,8']));
  });

  it('flags column duplicates', () => {
    const board = NO_GIVENS.split('');
    board[0] = '7';
    board[8 * 9] = '7';
    const grid = decodeBoard(board.join(''), NO_GIVENS);
    expect(findConflicts(grid)).toEqual(new Set(['0,0', '8,0']));
  });

  it('flags 3x3 box duplicates', () => {
    const board = NO_GIVENS.split('');
    // Same box (top-left 3x3): (0,0) and (2,2)
    board[0] = '4';
    board[2 * 9 + 2] = '4';
    const grid = decodeBoard(board.join(''), NO_GIVENS);
    expect(findConflicts(grid)).toEqual(new Set(['0,0', '2,2']));
  });

  it('does not flag zeros (empty cells)', () => {
    const board = NO_GIVENS.split('');
    board[0] = '0';
    board[1] = '0';
    const grid = decodeBoard(board.join(''), NO_GIVENS);
    expect(findConflicts(grid).size).toBe(0);
  });
});

describe('computeHighlight', () => {
  it('returns empty sets when no cell is selected', () => {
    const grid = decodeBoard(NO_GIVENS, NO_GIVENS);
    const h = computeHighlight(grid, null);
    expect(h.peers.size).toBe(0);
    expect(h.sameValue.size).toBe(0);
  });

  it('includes the same row, column, and box in peers', () => {
    const grid = decodeBoard(NO_GIVENS, NO_GIVENS);
    const h = computeHighlight(grid, [4, 4]);
    // Row 4 (9 cells) + col 4 (9) + box center (9) - overlaps. Sanity-check membership.
    expect(h.peers.has('4,0')).toBe(true); // same row
    expect(h.peers.has('0,4')).toBe(true); // same col
    expect(h.peers.has('3,3')).toBe(true); // same box
    expect(h.peers.has('0,0')).toBe(false);
  });

  it('flags cells sharing the selected non-zero value', () => {
    const board = NO_GIVENS.split('');
    board[0] = '7';
    board[80] = '7';
    const grid = decodeBoard(board.join(''), NO_GIVENS);
    const h = computeHighlight(grid, [0, 0]);
    expect(h.sameValue).toContain('0,0');
    expect(h.sameValue).toContain('8,8');
  });

  it('does not highlight same-value when selected cell is empty', () => {
    const grid = decodeBoard(NO_GIVENS, NO_GIVENS);
    const h = computeHighlight(grid, [0, 0]);
    expect(h.sameValue.size).toBe(0);
  });
});

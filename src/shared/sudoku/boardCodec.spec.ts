import { describe, expect, it } from 'vitest';

import { decodeBoard, encodeBoard, isComplete, isDigitString, setCellValue } from '@/shared/sudoku/boardCodec';
import { CELL_COUNT, BOARD_SIZE } from '@/shared/sudoku/types';

const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const SAMPLE_GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

describe('boardCodec', () => {
  it('decodes givens + currentBoard into a 9x9 grid with given flags', () => {
    const grid = decodeBoard(SAMPLE_GIVENS, SAMPLE_GIVENS);
    expect(grid).toHaveLength(BOARD_SIZE);
    expect(grid[0]).toHaveLength(BOARD_SIZE);
    expect(grid[0]![0]!.value).toBe(5);
    expect(grid[0]![0]!.given).toBe(true);
    expect(grid[0]![2]!.value).toBe(0);
    expect(grid[0]![2]!.given).toBe(false);
  });

  it('marks user-entered (non-given) cells when currentBoard differs from givens', () => {
    const currentBoard = SAMPLE_GIVENS.slice(0, 2) + '4' + SAMPLE_GIVENS.slice(3);
    const grid = decodeBoard(currentBoard, SAMPLE_GIVENS);
    expect(grid[0]![2]!.value).toBe(4);
    expect(grid[0]![2]!.given).toBe(false);
  });

  it('round-trips: encode(decode(b)) === b', () => {
    const grid = decodeBoard(SOLVED, SAMPLE_GIVENS);
    expect(encodeBoard(grid)).toBe(SOLVED);
  });

  it.each([
    ['too short', '1234'],
    ['too long', '0'.repeat(82)],
    ['non-digit', 'a'.repeat(81)],
  ])('rejects %s currentBoard input', (_label, bad) => {
    expect(() => decodeBoard(bad, '0'.repeat(81))).toThrow();
  });

  it('rejects invalid givens', () => {
    expect(() => decodeBoard('0'.repeat(81), 'a'.repeat(81))).toThrow();
    expect(() => decodeBoard('0'.repeat(81), '0'.repeat(80))).toThrow();
  });

  it('isComplete is true only for an 81-char digit-only string with no zeros', () => {
    expect(isComplete(SOLVED)).toBe(true);
    expect(isComplete(SAMPLE_GIVENS)).toBe(false);
    expect(isComplete('1'.repeat(80))).toBe(false);
  });

  it('isDigitString accepts only non-empty digit strings', () => {
    expect(isDigitString('012345678')).toBe(true);
    expect(isDigitString('')).toBe(false);
    expect(isDigitString('123a')).toBe(false);
  });

  it('setCellValue rejects mutating givens and out-of-range values', () => {
    const grid = decodeBoard(SAMPLE_GIVENS, SAMPLE_GIVENS);
    expect(() => setCellValue(grid, 0, 0, 4)).toThrow(/given/);
    expect(() => setCellValue(grid, 0, 2, 10)).toThrow();
    expect(() => setCellValue(grid, 0, 2, 4)).not.toThrow();
    expect(grid[0]![2]!.value).toBe(4);
  });

  it('CELL_COUNT matches BOARD_SIZE^2', () => {
    expect(CELL_COUNT).toBe(BOARD_SIZE * BOARD_SIZE);
  });
});

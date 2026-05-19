import { describe, expect, it } from 'vitest';

import { diffFills, solveSudoku } from '../e2e/util/solver';

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const EASY_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

const EXPERT = '800000000003600000070090200050007000000045700000100030001000068008500010090000400';

describe('solveSudoku', () => {
  it('solves a well-known easy puzzle', () => {
    const out = solveSudoku(EASY);
    expect(out).toBe(EASY_SOLUTION);
  });

  it('solves an expert puzzle (well-known minimal clue)', () => {
    const out = solveSudoku(EXPERT);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(81);
    expect(out!.includes('0')).toBe(false);
    // Verify every row contains 1-9 exactly once.
    for (let r = 0; r < 9; r++) {
      const row = out!.slice(r * 9, (r + 1) * 9);
      expect(new Set(row).size).toBe(9);
    }
  });

  it('returns null for a board with an unavoidable duplicate', () => {
    // Two 5s in the first row.
    const bad = '55' + '0'.repeat(79);
    expect(solveSudoku(bad)).toBeNull();
  });

  it('throws on a non-81-char board', () => {
    expect(() => solveSudoku('123')).toThrow(/81/);
  });

  it('throws on a board with non-digit characters', () => {
    const bad = 'A' + '0'.repeat(80);
    expect(() => solveSudoku(bad)).toThrow();
  });
});

describe('diffFills', () => {
  it('returns the cells filled in by the solver', () => {
    const fills = diffFills(EASY, EASY_SOLUTION);
    // EASY has 30 givens (51 empty), so the solver fills exactly 51 cells.
    expect(fills.length).toBe(51);
    // Each fill must be within bounds and contain a 1-9 value.
    for (const f of fills) {
      expect(f.row).toBeGreaterThanOrEqual(0);
      expect(f.row).toBeLessThan(9);
      expect(f.col).toBeGreaterThanOrEqual(0);
      expect(f.col).toBeLessThan(9);
      expect(f.value).toBeGreaterThanOrEqual(1);
      expect(f.value).toBeLessThanOrEqual(9);
    }
  });
});

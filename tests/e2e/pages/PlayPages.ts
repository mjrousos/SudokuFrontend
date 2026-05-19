import type { Page, Locator } from '@playwright/test';

import { diffFills, solveSudoku } from '../util/solver';

export class NewGamePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/play');
  }

  async start(mode: 'Practice' | 'Ranked', difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert'): Promise<void> {
    await this.page.locator(`[data-testid="mode-${mode}"]`).click();
    await this.page.locator(`[data-testid="difficulty-${difficulty}"]`).click();
    await this.page.locator('[data-testid="btn-start"]').click();
  }
}

export class PlayPage {
  constructor(private readonly page: Page) {}

  get board(): Locator {
    return this.page.locator('[data-testid="sudoku-board"]');
  }

  cell(row: number, col: number): Locator {
    return this.page.locator(`[data-testid="cell-${row}-${col}"]`);
  }

  async selectCell(row: number, col: number): Promise<void> {
    await this.cell(row, col).click();
  }

  async pressDigit(digit: number): Promise<void> {
    await this.page.locator(`[data-testid="pad-${digit}"]`).click();
  }

  async pressClear(): Promise<void> {
    await this.page.locator('[data-testid="pad-clear"]').click();
  }

  async pressHint(): Promise<void> {
    await this.page.locator('[data-testid="btn-hint"]').click();
  }

  async pressSubmit(): Promise<void> {
    await this.page.locator('[data-testid="btn-submit"]').click();
  }

  async pressAbandon(): Promise<void> {
    await this.page.locator('[data-testid="btn-abandon"]').click();
    await this.page.locator('[data-testid="btn-confirm-abandon"]').click();
  }

  /**
   * Read the current 9x9 board state out of the DOM. Empty cells return 0.
   * The values come from the `data-value` attribute set by `SudokuBoard.vue`.
   */
  async readBoard(): Promise<string> {
    return this.page.evaluate(() => {
      let out = '';
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const el = document.querySelector(`[data-testid="cell-${r}-${c}"]`);
          const v = el?.getAttribute('data-value');
          out += v && /^[1-9]$/.test(v) ? v : '0';
        }
      }
      return out;
    });
  }

  /** Reads the puzzle's givens (cells with `data-given`). */
  async readGivens(): Promise<string> {
    return this.page.evaluate(() => {
      let out = '';
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const el = document.querySelector(`[data-testid="cell-${r}-${c}"]`);
          const given = el?.getAttribute('data-given') !== null;
          const v = el?.getAttribute('data-value');
          out += given && v && /^[1-9]$/.test(v) ? v : '0';
        }
      }
      return out;
    });
  }

  /**
   * Auto-solve the current puzzle by entering each missing digit via the
   * keypad. This drives the UI exactly as a user would, so the backend
   * sees one POST /moves per fill (serialized by the move queue).
   *
   * Waits for the board to render with its givens before reading state, so
   * we don't try to "solve" an all-zeros snapshot taken before the GET
   * /games/:id response landed.
   */
  async autoSolve(): Promise<void> {
    await this.board.waitFor();
    await this.page.locator('[data-testid="sudoku-board"] [data-given]').first().waitFor();
    const givens = await this.readGivens();
    const current = await this.readBoard();
    const solved = solveSudoku(givens);
    if (!solved) throw new Error('Solver failed to solve the puzzle.');
    const fills = diffFills(current, solved);
    for (const { row, col, value } of fills) {
      await this.selectCell(row, col);
      await this.pressDigit(value);
    }
  }
}

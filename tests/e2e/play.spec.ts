import { LoginPage } from './pages/AuthPages';
import { NewGamePage, PlayPage } from './pages/PlayPages';
import { registerAndLogin } from './util/api';
import { expect, test } from './fixtures';

async function signIn(page: import('@playwright/test').Page, forwardedFor: string): Promise<void> {
  const user = await registerAndLogin('play', forwardedFor);
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.email, user.password);
  await page.waitForURL('/');
}

test.describe('Game play', () => {
  test('create practice game, enter a digit, see it on the board', async ({ page, forwardedFor }) => {
    await signIn(page, forwardedFor);
    const newGame = new NewGamePage(page);
    await newGame.goto();
    await newGame.start('Practice', 'Easy');

    await page.waitForURL(/\/play\/[\w-]+/);
    const play = new PlayPage(page);
    await expect(play.board).toBeVisible();

    // Find the first empty (non-given) cell and enter a digit.
    const empty = await page.evaluate(() => {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const el = document.querySelector(`[data-testid="cell-${r}-${c}"]`);
          if (el && el.getAttribute('data-given') === null && !el.textContent?.trim()) {
            return [r, c];
          }
        }
      }
      return null;
    });
    expect(empty).not.toBeNull();
    const [r, c] = empty as [number, number];
    await play.selectCell(r, c);
    await play.pressDigit(5);

    // Server reconciles; allow up to a few ticks for the response to land.
    await expect(play.cell(r, c)).toHaveAttribute('data-value', /[1-9]/);
  });

  test('using a hint marks the game assisted and decreases empty cells', async ({ page, forwardedFor }) => {
    await signIn(page, forwardedFor);
    const newGame = new NewGamePage(page);
    await newGame.goto();
    await newGame.start('Practice', 'Easy');
    await page.waitForURL(/\/play\/[\w-]+/);
    const play = new PlayPage(page);
    // Wait for the board to render with its givens before snapshotting it,
    // otherwise `readBoard()` returns all zeros (cells with no data-value)
    // and the diff against the post-hint state looks like the entire board
    // was filled.
    await expect(play.board).toBeVisible();
    await page.locator('[data-testid="sudoku-board"] [data-given]').first().waitFor();

    const before = await play.readBoard();
    await play.pressHint();
    // After hint, one previously-empty cell should now be filled.
    await expect.poll(async () => {
      const after = await play.readBoard();
      let filled = 0;
      for (let i = 0; i < 81; i++) {
        if (before[i] === '0' && after[i] !== '0') filled++;
      }
      return filled;
    }).toBe(1);
    await expect(page.locator('[data-testid="toolbar-hints"]')).toContainText('1');
  });

  test('auto-solve → submit → see completion dialog', async ({ page, forwardedFor }) => {
    test.setTimeout(120_000);
    await signIn(page, forwardedFor);
    const newGame = new NewGamePage(page);
    await newGame.goto();
    await newGame.start('Practice', 'Easy');
    await page.waitForURL(/\/play\/[\w-]+/);
    const play = new PlayPage(page);
    await play.autoSolve();
    // The submit button is gated on the server-confirmed `currentBoard` being
    // complete; wait for the per-game move queue to flush before clicking.
    await expect(page.locator('[data-testid="btn-submit"]')).toBeEnabled({ timeout: 30_000 });
    await play.pressSubmit();
    await expect(page.locator('[data-testid="completion-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="completion-dialog"]')).toContainText(
      /solved/i,
    );
  });

  test('abandon flow marks the game abandoned', async ({ page, forwardedFor }) => {
    await signIn(page, forwardedFor);
    const newGame = new NewGamePage(page);
    await newGame.goto();
    await newGame.start('Practice', 'Easy');
    await page.waitForURL(/\/play\/[\w-]+/);
    const play = new PlayPage(page);
    await play.pressAbandon();
    await expect(page.locator('[data-testid="status-badge"]')).toContainText(/abandoned/i);
  });
});

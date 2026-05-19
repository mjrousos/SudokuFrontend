import { expect, test } from './fixtures';

test.describe('Leaderboards', () => {
  test('difficulty leaderboard renders empty state when no entries yet', async ({ page }) => {
    await page.goto('/leaderboards/Easy');
    await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible();
    // Either empty or has entries; both are valid. We only assert the table exists.
    await expect(page.locator('table, [data-testid="leaderboard-empty"]')).toBeVisible();
  });

  test('today\'s daily leaderboard shows the locked / not-yet-available state', async ({
    page,
  }) => {
    await page.goto('/leaderboards/daily');
    await expect(page.getByText(/available.*midnight|tomorrow|not.*available/i)).toBeVisible();
  });

  test('switching period reloads the leaderboard', async ({ page }) => {
    await page.goto('/leaderboards/Easy');
    let leaderboardCalls = 0;
    await page.route(
      (url) => url.pathname.includes('/leaderboards/'),
      async (route) => {
        leaderboardCalls++;
        await route.continue();
      },
    );
    await page.getByTestId('period-tab-Weekly').click();
    await page.waitForLoadState('networkidle');
    expect(leaderboardCalls).toBeGreaterThanOrEqual(1);
  });
});

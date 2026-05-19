import { LoginPage } from './pages/AuthPages';
import { registerAndLogin } from './util/api';
import { expect, test } from './fixtures';

test.describe('Token refresh', () => {
  test('a stale access token (server 401) triggers silent refresh and request succeeds', async ({
    page,
    forwardedFor,
  }) => {
    const user = await registerAndLogin('refresh', forwardedFor);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await page.waitForURL('/');

    let statsCalls = 0;
    let refreshCalls = 0;
    const seenRequests: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/v1/')) seenRequests.push(`${req.method()} ${req.url()}`);
    });

    // Match by URL substring — globs with `**` prefix can interact oddly with
    // Playwright's pattern matcher in newer versions; a function predicate is
    // unambiguous and matches any URL containing the stats path.
    await page.route(
      (url) => url.pathname.endsWith('/users/me/stats'),
      async (route) => {
        statsCalls++;
        if (statsCalls === 1) {
          await route.fulfill({
            status: 401,
            contentType: 'application/problem+json',
            body: JSON.stringify({ title: 'token_expired', status: 401 }),
          });
        } else {
          await route.continue();
        }
      },
    );

    await page.route(
      (url) => url.pathname.endsWith('/auth/refresh'),
      async (route) => {
        refreshCalls++;
        await route.continue();
      },
    );

    await page.goto('/stats');

    await expect(page).toHaveURL(/\/stats/);
    // Wait for the stats summary to render — proves the refresh-and-retry
    // succeeded end-to-end.
    await expect(page.locator('[data-testid="stats-summary"]')).toBeVisible({ timeout: 15_000 });
    expect(refreshCalls).toBeGreaterThanOrEqual(1);
    expect(statsCalls).toBeGreaterThanOrEqual(2);
    // Keep `seenRequests` referenced so it isn't tree-shaken — useful when
    // diagnosing intercept misses locally.
    expect(seenRequests.length).toBeGreaterThan(0);
  });
});

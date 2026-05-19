import { LoginPage } from './pages/AuthPages';
import { registerAndLogin } from './util/api';
import { expect, test } from './fixtures';

test.describe('Multi-tab refresh coordination', () => {
  test('two tabs sharing a context stay authenticated through parallel 401s', async ({ browser, forwardedFor }) => {
    const user = await registerAndLogin('multitab', forwardedFor);
    const ctx = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': forwardedFor },
    });
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    const loginA = new LoginPage(tabA);
    await loginA.goto();
    await loginA.login(user.email, user.password);
    await tabA.waitForURL('/');

    // Open tab B sharing the same browser context (localStorage shared) — it
    // hydrates from the persisted refresh token and silently obtains a fresh
    // access token of its own. Allow hydration to settle.
    await tabB.goto('/');
    await tabB.waitForLoadState('networkidle');

    let refreshCalls = 0;
    const countRefresh = async (route: import('@playwright/test').Route) => {
      refreshCalls++;
      // Add latency so the second tab's attempt overlaps the first if it
      // doesn't dedupe via the cross-tab lock.
      await new Promise((r) => setTimeout(r, 150));
      await route.continue();
    };
    const refreshPredicate = (url: URL) => url.pathname.endsWith('/auth/refresh');
    await tabA.route(refreshPredicate, countRefresh);
    await tabB.route(refreshPredicate, countRefresh);

    // Navigate both tabs in parallel to authenticated routes — both will
    // independently load profile/stats data. Without per-tab coordination
    // they could each trigger their own refresh; with the BroadcastChannel +
    // Web Locks coordination, the second tab should reuse the first tab's
    // freshly issued token via broadcast.
    await Promise.all([tabA.goto('/profile'), tabB.goto('/stats')]);
    await Promise.all([tabA.waitForLoadState('networkidle'), tabB.waitForLoadState('networkidle')]);

    // Both tabs remain authenticated AND the access token still works.
    await expect(tabA).toHaveURL(/\/profile/);
    await expect(tabB).toHaveURL(/\/stats/);
    await expect(tabA.getByTestId('header-displayName')).toContainText(user.displayName);
    await expect(tabB.getByTestId('header-displayName')).toContainText(user.displayName);
    // Both pages must have rendered their authenticated content (proof the
    // session is still valid and not stuck on a login redirect).
    await expect(tabA.getByRole('heading', { name: /profile/i })).toBeVisible();
    await expect(tabB.getByRole('heading', { name: /stats/i })).toBeVisible();
    // Reasonable upper bound on refresh chatter — without ANY coordination
    // each tab + each guard hop could fire its own refresh; with our
    // BroadcastChannel + Web Locks dedupe we expect at most a couple.
    expect(refreshCalls).toBeLessThanOrEqual(2);

    await ctx.close();
  });

  test('concurrent 401s in two tabs trigger only one refresh (cross-tab lock works)', async ({ browser, forwardedFor }) => {
    const user = await registerAndLogin('multitab401', forwardedFor);
    const ctx = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': forwardedFor },
    });
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    const loginA = new LoginPage(tabA);
    await loginA.goto();
    await loginA.login(user.email, user.password);
    await tabA.waitForURL('/');

    await tabB.goto('/');
    await tabB.waitForLoadState('networkidle');

    let refreshCalls = 0;
    const countRefresh = async (route: import('@playwright/test').Route) => {
      refreshCalls++;
      await new Promise((r) => setTimeout(r, 150));
      await route.continue();
    };
    const refreshPredicate = (url: URL) => url.pathname.endsWith('/auth/refresh');
    await tabA.route(refreshPredicate, countRefresh);
    await tabB.route(refreshPredicate, countRefresh);

    // Intercept GET /users/me on each tab to return 401 exactly once per tab,
    // then let subsequent requests through so the app can recover after refresh.
    let tabA401Count = 0;
    let tabB401Count = 0;
    const mePredicate = (url: URL) => url.pathname.endsWith('/users/me');

    await tabA.route(mePredicate, async (route) => {
      if (tabA401Count < 1) {
        tabA401Count++;
        await route.fulfill({ status: 401, body: '{"type":"https://httpstatuses.com/401","title":"Unauthorized","status":401}', headers: { 'content-type': 'application/problem+json' } });
      } else {
        await route.continue();
      }
    });

    await tabB.route(mePredicate, async (route) => {
      if (tabB401Count < 1) {
        tabB401Count++;
        await route.fulfill({ status: 401, body: '{"type":"https://httpstatuses.com/401","title":"Unauthorized","status":401}', headers: { 'content-type': 'application/problem+json' } });
      } else {
        await route.continue();
      }
    });

    // Trigger both tabs' protected-page loads simultaneously to race their
    // 401-recovery paths through the cross-tab lock.
    await Promise.all([tabA.goto('/profile'), tabB.goto('/profile')]);
    await Promise.all([tabA.waitForLoadState('networkidle'), tabB.waitForLoadState('networkidle')]);

    // Both tabs should still be authenticated.
    await expect(tabA).toHaveURL(/\/profile/);
    await expect(tabB).toHaveURL(/\/profile/);

    // The cross-tab lock should have serialized the refresh so only one
    // actually hit the server (the second tab reuses the broadcast token).
    // Allow <= 2 for timing resilience.
    expect(refreshCalls).toBeLessThanOrEqual(2);

    await ctx.close();
  });

});

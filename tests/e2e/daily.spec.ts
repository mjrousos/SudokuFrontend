import { LoginPage } from './pages/AuthPages';
import { NewGamePage, PlayPage } from './pages/PlayPages';
import { registerAndLogin } from './util/api';
import { expect, test } from './fixtures';

test.describe('Daily puzzle', () => {
  test('authenticated user can start today\'s daily and abandon it', async ({ page, forwardedFor }) => {
    const user = await registerAndLogin('daily', forwardedFor);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await page.waitForURL('/');

    await page.goto('/daily');
    await page.getByRole('button', { name: /play today/i }).click();
    await page.waitForURL(/\/play\/[\w-]+/);
    const play = new PlayPage(page);
    await expect(play.board).toBeVisible();
    await play.pressAbandon();
    await expect(page.locator('[data-testid="status-badge"]')).toContainText(/abandoned/i);
  });

  test('starting daily twice returns the same game (get-or-create)', async ({ page, forwardedFor }) => {
    const user = await registerAndLogin('daily2', forwardedFor);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await page.waitForURL('/');

    await page.goto('/daily');
    await page.getByRole('button', { name: /play today/i }).click();
    await page.waitForURL(/\/play\/[\w-]+/);
    const firstUrl = page.url();

    await page.goto('/daily');
    await page.getByRole('button', { name: /play today/i }).click();
    await page.waitForURL(/\/play\/[\w-]+/);
    const secondUrl = page.url();

    expect(firstUrl).toBe(secondUrl);
  });
});

// Pull NewGamePage import in so TS doesn't flag unused; it's not needed here.
void NewGamePage;

import { HeaderPage } from './pages/HeaderPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { register } from './util/api';
import { expect, test } from './fixtures';

function uniqueEmail(): { email: string; password: string; displayName: string } {
  const id = Math.random().toString(36).slice(2, 10);
  return {
    email: `e2e-${id}@example.com`,
    password: 'CorrectHorse1!',
    displayName: `e2e-${id}`,
  };
}

test.describe('Auth flows', () => {
  test('register → automatic login → see displayName in header', async ({ page }) => {
    const creds = uniqueEmail();
    const registerPage = new RegisterPage(page);
    const header = new HeaderPage(page);

    await registerPage.goto();
    await registerPage.register(creds.email, creds.password, creds.displayName);

    // Backend has RequireEmailConfirmation=false in the default Production
    // appsettings, so register triggers a follow-up login and we land at /.
    await page.waitForURL('/');
    await expect(header.displayName).toBeVisible();
    await expect(header.displayName).toContainText(creds.displayName);
  });

  test('invalid login shows specific error and does not sign in', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const header = new HeaderPage(page);
    await loginPage.goto();
    await loginPage.login('nobody-xxx@example.com', 'WrongPassword1!');
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(header.displayName).toHaveCount(0);
  });

  test('successful login then logout clears session', async ({ page, forwardedFor }) => {
    const creds = uniqueEmail();
    await register(creds.email, creds.password, creds.displayName, forwardedFor);
    const loginPage = new LoginPage(page);
    const header = new HeaderPage(page);
    await loginPage.goto();
    await loginPage.login(creds.email, creds.password);
    await page.waitForURL('/');
    await expect(header.displayName).toBeVisible();

    await header.logout();
    await page.waitForURL(/\/login/);
    await expect(header.displayName).toHaveCount(0);
  });

  test('authGuard redirects to /login when navigating to /play unauthenticated', async ({
    page,
  }) => {
    await page.goto('/play');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('redirectTo=');
  });
});

import { LoginPage } from './pages/AuthPages';
import { readLatestPasswordResetToken } from './util/dockerLogs';
import { register } from './util/api';
import { expect, test } from './fixtures';

test.describe('Password reset', () => {
  test.skip(
    process.env.E2E_SKIP_BACKEND === '1',
    'Skipped: depends on docker logs to read the reset token.',
  );

  test('request reset → read token from console email sender → set new password → log in', async ({
    page,
    forwardedFor,
  }) => {
    const id = Math.random().toString(36).slice(2, 10);
    const email = `reset-${id}@example.com`;
    const oldPassword = 'OldPass123!';
    const newPassword = 'NewPass456!';
    const displayName = `reset-${id}`;
    await register(email, oldPassword, displayName, forwardedFor);

    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /send|reset|request/i }).click();
    // 202 is always returned; UI should confirm.
    await expect(page.getByText(/check your email|sent|if an account exists/i)).toBeVisible();

    // Pull the latest token out of the ConsoleEmailSender log lines.
    let token: string | null = null;
    for (let i = 0; i < 10 && !token; i++) {
      await new Promise((r) => setTimeout(r, 500));
      token = await readLatestPasswordResetToken(email);
    }
    expect(token, 'Expected to find a reset token in docker logs').toBeTruthy();

    await page.goto(
      `/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token!)}`,
    );
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole('button', { name: /reset|set password|save/i }).click();

    await page.waitForURL(/\/login/);
    const loginPage = new LoginPage(page);
    await loginPage.login(email, newPassword);
    await page.waitForURL('/');
    await expect(page.locator('[data-testid="header-displayName"]')).toContainText(displayName);
  });
});

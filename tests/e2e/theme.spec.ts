import { expect, test } from './fixtures';

/**
 * Dark-mode toggle: verifies the tri-state Light / Dark / System cycle,
 * persistence across reloads (via /theme-init.js running before the app
 * mounts), and that "system" mode tracks the OS-level
 * `prefers-color-scheme` via Playwright's `emulateMedia`.
 *
 * No backend traffic is involved; this is a pure UI / browser-storage
 * test. We still use the shared `fixtures.ts` `test` for consistency
 * with the rest of the suite.
 */
test.describe('Theme toggle', () => {
  // `fixtures.ts` (`context: async ({ browser, forwardedFor }, use)`)
  // creates a fresh browser context for every test and closes it
  // afterwards, so there is no cookie / localStorage carryover between
  // tests — no per-test reset hook is needed here.

  test('cycles Light → Dark → System and applies the dark class on <html>', async ({ page }) => {
    // Force a deterministic OS preference so "system" resolves to light
    // and the "Light → Dark" transition is the first visible flip.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sudoku.theme', 'light');
      } catch {
        // Some browsers throw before the document exists; ignore.
      }
    });

    await page.goto('/');

    const toggle = page.locator('[data-testid="theme-toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'light');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

    // light -> dark
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'dark');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

    // dark -> system (OS is light, so dark class is removed)
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

    // system -> light
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'light');
  });

  test('preference persists across reloads with no flash of the wrong theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const toggle = page.locator('[data-testid="theme-toggle"]');
    await toggle.click(); // system -> light
    await toggle.click(); // light -> dark
    await expect(toggle).toHaveAttribute('data-theme-preference', 'dark');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

    await page.reload();

    // The pre-mount initializer in /theme-init.js should have applied the
    // dark class before any Vue code runs, so it is present immediately.
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(toggle).toHaveAttribute('data-theme-preference', 'dark');

    // Sanity-check the persisted value matches what the toggle reports.
    const persisted = await page.evaluate(() => window.localStorage.getItem('sudoku.theme'));
    expect(persisted).toBe('dark');
  });

  test('"system" preference follows the OS prefers-color-scheme media query', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sudoku.theme', 'system');
      } catch {
        // ignore
      }
    });

    await page.goto('/');

    const toggle = page.locator('[data-testid="theme-toggle"]');
    await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
    await expect(toggle).toHaveAttribute('data-theme-resolved', 'light');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

    // Flip the OS to dark — the matchMedia listener inside useTheme should
    // pick it up and the resolved theme should update in lockstep.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(toggle).toHaveAttribute('data-theme-resolved', 'dark');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

    // And back to light.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(toggle).toHaveAttribute('data-theme-resolved', 'light');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('toggle is visible on auth screens (AuthLayout) as well', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    const toggle = page.locator('[data-testid="theme-toggle"]');
    await expect(toggle).toBeVisible();
    // Default (no persisted value) is "system"; cycle order is
    // light → dark → system → light, so one click from "system" lands on
    // "light" and a second click lands on "dark" with the html.dark class
    // applied. Asserting the resolved DOM state is the meaningful check
    // here — it proves the toggle is functional on the auth layout.
    await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'light');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'dark');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

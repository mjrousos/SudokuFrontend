import type { Page, Locator } from '@playwright/test';

export class HeaderPage {
  constructor(private readonly page: Page) {}

  get displayName(): Locator {
    return this.page.locator('[data-testid="header-displayName"]');
  }

  get loginLink(): Locator {
    return this.page.getByRole('link', { name: /sign in|log in/i });
  }

  get logoutButton(): Locator {
    return this.page.locator('[data-testid="header-logout"]');
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}

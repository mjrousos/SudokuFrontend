import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(redirectTo?: string): Promise<void> {
    const url = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login';
    await this.page.goto(url);
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /^log in$|^sign in$/i }).click();
  }
}

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    await this.page.getByLabel(/display name/i).fill(displayName);
    await this.page.getByLabel(/^email/i).fill(email);
    await this.page.getByLabel(/^password/i).fill(password);
    await this.page.getByRole('button', { name: /create account|register|sign up/i }).click();
  }
}

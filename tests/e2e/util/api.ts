/**
 * Small typed fetch helpers used by Playwright global setup and test fixtures
 * to talk to the backend HTTP API directly (bypassing the UI). Kept tiny and
 * dependency-free so it can be imported from globalSetup.
 *
 * Helpers accept an optional `forwardedFor` so each test can attribute its
 * direct-API calls to the same synthetic IP used by its browser context (see
 * `tests/e2e/fixtures.ts`), keeping rate-limit partitions isolated.
 */

const API = process.env.API_BASE_URL ?? 'http://localhost:8080';
const V1 = `${API}/api/v1`;

export interface RegisteredUser {
  userId: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
}

function withForwarded(headers: Record<string, string>, forwardedFor?: string): Record<string, string> {
  return forwardedFor ? { ...headers, 'X-Forwarded-For': forwardedFor } : headers;
}

export async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API}/health/ready`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(2000);
  }
  throw new Error(`Backend not ready within ${timeoutMs}ms.`);
}

export async function register(
  email: string,
  password: string,
  displayName: string,
  forwardedFor?: string,
): Promise<void> {
  const res = await fetch(`${V1}/auth/register`, {
    method: 'POST',
    headers: withForwarded({ 'content-type': 'application/json' }, forwardedFor),
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!res.ok) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
}

export async function login(
  email: string,
  password: string,
  forwardedFor?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const res = await fetch(`${V1}/auth/login`, {
    method: 'POST',
    headers: withForwarded({ 'content-type': 'application/json' }, forwardedFor),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { accessToken: string; refreshToken: string; userId: string };
}

export async function registerAndLogin(
  prefix = 'test',
  forwardedFor?: string,
): Promise<RegisteredUser> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${suffix}@example.com`;
  const password = 'CorrectHorse1!';
  const displayName = `${prefix}-${suffix}`;
  await register(email, password, displayName, forwardedFor);
  const tokens = await login(email, password, forwardedFor);
  return { ...tokens, email, password, displayName };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

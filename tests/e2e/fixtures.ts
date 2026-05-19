/**
 * E2E test fixture that gives each test a unique X-Forwarded-For so the
 * backend's per-IP rate limits (10 auth requests / min) don't bleed across
 * tests. The backend trusts forwarded headers from localhost by default
 * (Microsoft.AspNetCore.HttpOverrides.ForwardedHeadersOptions), so setting
 * `X-Forwarded-For` on every request reassigns the rate-limit partition key.
 *
 * Each test gets its own context (Playwright's default) with
 * `extraHTTPHeaders` carrying the synthetic IP. Any helper that talks to the
 * backend directly via node-fetch (see `util/api.ts`) should also pass this
 * header through `forwardedFor`.
 */
import { test as base, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';

/**
 * Generate a unique synthetic IP per test in the 10.0.0.0/8 private range.
 *
 * We *cannot* use a simple per-process counter because Playwright spawns
 * multiple worker processes (one per CPU thread by default) and each worker
 * would restart its counter at 0, producing colliding IPs across workers and
 * defeating the rate-limit partitioning. Random sampling from a 24-bit space
 * (~16M values) makes intra-suite collisions vanishingly unlikely for our
 * test counts.
 */
function nextSyntheticIp(): string {
  const b = randomInt(0, 256);
  const c = randomInt(0, 256);
  const d = randomInt(1, 256);
  return `10.${b}.${c}.${d}`;
}

interface Fixtures {
  forwardedFor: string;
}

export const test = base.extend<Fixtures>({
  forwardedFor: async ({}, use) => {
    await use(nextSyntheticIp());
  },
  context: async ({ browser, forwardedFor }, use) => {
    const ctx = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': forwardedFor },
    });
    await use(ctx);
    await ctx.close();
  },
});

export { expect };

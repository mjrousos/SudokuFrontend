// Vitest setup: global test polyfills and reset hooks.
import { beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { __resetHttpClientForTests } from '@/shared/api/client';

beforeEach(() => {
  setActivePinia(createPinia());
  __resetHttpClientForTests();
});

afterEach(() => {
  __resetHttpClientForTests();
});

// crypto.randomUUID polyfill for happy-dom (which sometimes lacks it).
if (typeof globalThis.crypto === 'undefined') {
  // Lazy require to avoid pulling node:crypto in browser builds.
  const nodeCrypto = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto.webcrypto,
    configurable: true,
  });
}

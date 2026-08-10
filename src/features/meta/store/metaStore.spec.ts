import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { __resetHttpClientForTests } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { API_V1 } from '@/shared/config';

import { useMetaStore } from './metaStore';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  // Instantiating the auth store installs the shared HTTP client.
  useAuthStore();
});

function versionHandler(body: unknown, counter?: { calls: number }) {
  return http.get(`${API_V1}/version`, () => {
    if (counter) counter.calls++;
    return HttpResponse.json(body as Record<string, unknown>);
  });
}

describe('useMetaStore', () => {
  it('loads and exposes the backend version', async () => {
    server.use(versionHandler({ version: '1.2.3' }));
    const store = useMetaStore();

    expect(store.backendVersion).toBeNull();
    await store.loadBackendVersion();

    expect(store.backendVersion).toBe('1.2.3');
    expect(store.loading).toBe(false);
    expect(store.failed).toBe(false);
  });

  it('trims surrounding whitespace from the version', async () => {
    server.use(versionHandler({ version: '  2.0.1  ' }));
    const store = useMetaStore();

    await store.loadBackendVersion();
    expect(store.backendVersion).toBe('2.0.1');
  });

  it('sets loading true while the request is in flight', async () => {
    server.use(versionHandler({ version: '1.0.0' }));
    const store = useMetaStore();

    const promise = store.loadBackendVersion();
    expect(store.loading).toBe(true);
    await promise;
    expect(store.loading).toBe(false);
  });

  it('does not refetch once the version is loaded', async () => {
    const counter = { calls: 0 };
    server.use(versionHandler({ version: '1.2.3' }, counter));
    const store = useMetaStore();

    await store.loadBackendVersion();
    await store.loadBackendVersion();

    expect(counter.calls).toBe(1);
  });

  it('de-dupes concurrent loads into a single request', async () => {
    const counter = { calls: 0 };
    server.use(versionHandler({ version: '3.1.4' }, counter));
    const store = useMetaStore();

    await Promise.all([store.loadBackendVersion(), store.loadBackendVersion()]);

    expect(counter.calls).toBe(1);
    expect(store.backendVersion).toBe('3.1.4');
  });

  it('marks failed when the payload has an empty version string', async () => {
    server.use(versionHandler({ version: '   ' }));
    const store = useMetaStore();

    await store.loadBackendVersion();

    expect(store.backendVersion).toBeNull();
    expect(store.failed).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('marks failed when the version field is not a string', async () => {
    server.use(versionHandler({ version: 42 }));
    const store = useMetaStore();

    await store.loadBackendVersion();

    expect(store.backendVersion).toBeNull();
    expect(store.failed).toBe(true);
  });

  it('swallows server errors and marks failed', async () => {
    server.use(
      http.get(`${API_V1}/version`, () =>
        HttpResponse.json({ status: 500, title: 'boom' }, { status: 500 }),
      ),
    );
    const store = useMetaStore();

    // Should resolve (never reject) — the version display is non-critical.
    await expect(store.loadBackendVersion()).resolves.toBeUndefined();
    expect(store.backendVersion).toBeNull();
    expect(store.failed).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('swallows network errors and marks failed', async () => {
    server.use(http.get(`${API_V1}/version`, () => HttpResponse.error()));
    const store = useMetaStore();

    await expect(store.loadBackendVersion()).resolves.toBeUndefined();
    expect(store.failed).toBe(true);
  });

  it('reset() clears loaded state and allows a subsequent fetch', async () => {
    const counter = { calls: 0 };
    server.use(versionHandler({ version: '1.2.3' }, counter));
    const store = useMetaStore();

    await store.loadBackendVersion();
    expect(store.backendVersion).toBe('1.2.3');

    store.reset();
    expect(store.backendVersion).toBeNull();
    expect(store.failed).toBe(false);
    expect(store.loading).toBe(false);

    await store.loadBackendVersion();
    expect(counter.calls).toBe(2);
    expect(store.backendVersion).toBe('1.2.3');
  });
});

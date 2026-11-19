import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { __resetHttpClientForTests } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useMetaStore } from '@/features/meta/store/metaStore';
import { API_V1 } from '@/shared/config';

import BackendVersion from './BackendVersion.vue';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  __resetHttpClientForTests();
  setActivePinia(createPinia());
  // Installs the shared HTTP client used by the meta store.
  useAuthStore();
});

const SELECTOR = '[data-testid="backend-version"]';

describe('BackendVersion.vue', () => {
  it('renders the version once loaded on mount', async () => {
    server.use(http.get(`${API_V1}/version`, () => HttpResponse.json({ version: '1.2.3' })));
    const store = useMetaStore();

    const wrapper = mount(BackendVersion);
    // Shares the in-flight request kicked off by the component's onMounted hook.
    await store.loadBackendVersion();
    await nextTick();

    expect(wrapper.find(SELECTOR).exists()).toBe(true);
    expect(wrapper.text()).toContain('API v1.2.3');
  });

  it('renders nothing when the version fetch fails', async () => {
    server.use(
      http.get(`${API_V1}/version`, () =>
        HttpResponse.json({ status: 503, title: 'down' }, { status: 503 }),
      ),
    );
    const store = useMetaStore();

    const wrapper = mount(BackendVersion);
    await store.loadBackendVersion();
    await nextTick();

    expect(store.failed).toBe(true);
    expect(wrapper.find(SELECTOR).exists()).toBe(false);
  });
});

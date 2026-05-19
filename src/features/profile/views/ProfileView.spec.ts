import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import { __resetHttpClientForTests } from '@/shared/api/client';
import type { AuthTokenResponse, UserProfileResponse } from '@/shared/api/types';

import { useProfileStore } from '../store/profileStore';
import ProfileView from './ProfileView.vue';

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function makeTokens(overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse {
  return {
    accessToken: 'access-token',
    accessTokenExpiresAt: isoIn(5 * 60_000),
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: isoIn(7 * 24 * 60 * 60_000),
    userId: 'user-1',
    displayName: 'Alice',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfileResponse> = {}): UserProfileResponse {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: isoAgo(24 * 60 * 60_000),
    ...overrides,
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/login', name: 'login', component: { template: '<div>login</div>' } },
      { path: '/profile', name: 'profile', component: ProfileView },
    ],
  });
}

describe('ProfileView', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetHttpClientForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetHttpClientForTests();
  });

  it('renders the email and current display name after loading', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/profile');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const profileStore = useProfileStore();
    const profile = makeProfile();
    vi.spyOn(profileStore, 'load').mockImplementation(async () => {
      profileStore.profile = profile;
      return profile;
    });

    const wrapper = mount(ProfileView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true },
      },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="profile-email"]').text()).toContain(profile.email);
    expect((wrapper.get('#profile-display-name').element as HTMLInputElement).value).toBe(
      profile.displayName,
    );
  });

  it('submitting the display name form calls updateDisplayName', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/profile');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const profileStore = useProfileStore();
    const profile = makeProfile();
    vi.spyOn(profileStore, 'load').mockImplementation(async () => {
      profileStore.profile = profile;
      return profile;
    });
    const updateDisplayName = vi
      .spyOn(profileStore, 'updateDisplayName')
      .mockResolvedValue({ ...profile, displayName: 'Alicia' });

    const wrapper = mount(ProfileView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true },
      },
    });

    await flushPromises();
    await wrapper.get('#profile-display-name').setValue('Alicia');
    await wrapper.get('[data-testid="edit-display-name-form"]').trigger('submit');
    await flushPromises();

    expect(updateDisplayName).toHaveBeenCalledWith('Alicia');
  });

  it('requires the display name before enabling account deletion', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push('/profile');
    await router.isReady();

    const auth = useAuthStore();
    auth._applyTokens(makeTokens());
    const profileStore = useProfileStore();
    const profile = makeProfile({ displayName: 'Alice' });
    vi.spyOn(profileStore, 'load').mockImplementation(async () => {
      profileStore.profile = profile;
      return profile;
    });

    const wrapper = mount(ProfileView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true },
      },
    });

    await flushPromises();
    await wrapper.get('[data-testid="open-delete-account"]').trigger('click');
    await flushPromises();

    const confirmButton = wrapper.get('[data-testid="confirm-delete-account"]');
    expect((confirmButton.element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.get('#delete-account-confirmation').setValue('Wrong');
    expect((confirmButton.element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.get('#delete-account-confirmation').setValue('Alice');
    expect((confirmButton.element as HTMLButtonElement).disabled).toBe(false);
  });
});

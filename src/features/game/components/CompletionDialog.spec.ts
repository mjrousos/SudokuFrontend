import { RouterLinkStub, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import CompletionDialog from './CompletionDialog.vue';
import { useAuthStore } from '@/features/auth/store/authStore';

function authenticate(): void {
  const auth = useAuthStore();
  auth._applyTokens(
    {
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      userId: 'user-1',
      displayName: 'Tester',
    },
    { broadcast: false, persist: false },
  );
}

function mountDialog(props: Partial<InstanceType<typeof CompletionDialog>['$props']> = {}) {
  return mount(CompletionDialog, {
    props: {
      open: true,
      isCorrect: true,
      elapsedMs: 60_000,
      mistakeCount: 0,
      isAssisted: false,
      leaderboardEntryCreated: false,
      ...props,
    },
    global: {
      stubs: {
        teleport: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('CompletionDialog sign-in prompt', () => {
  it('shows the sign-in prompt for anonymous users when no leaderboard entry was created', () => {
    // Anonymous user (not authenticated), correct solution, no leaderboard entry
    const wrapper = mountDialog({ isCorrect: true, leaderboardEntryCreated: false });

    expect(wrapper.find('[data-testid="completion-sign-in-prompt"]').exists()).toBe(true);
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.props('to')).toEqual({ name: 'login' });
  });

  it('does not show the sign-in prompt for authenticated users even without a leaderboard entry', () => {
    authenticate();
    // Authenticated user in Practice mode — leaderboardEntryCreated is false but user is logged in
    const wrapper = mountDialog({ isCorrect: true, leaderboardEntryCreated: false });

    expect(wrapper.find('[data-testid="completion-sign-in-prompt"]').exists()).toBe(false);
  });

  it('does not show the sign-in prompt when leaderboard entry was created', () => {
    // Authenticated user with leaderboard entry
    authenticate();
    const wrapper = mountDialog({ isCorrect: true, leaderboardEntryCreated: true });

    expect(wrapper.find('[data-testid="completion-sign-in-prompt"]').exists()).toBe(false);
  });

  it('does not show the sign-in prompt when solution is incorrect', () => {
    // Anonymous user with incorrect solution
    const wrapper = mountDialog({ isCorrect: false, leaderboardEntryCreated: false });

    expect(wrapper.find('[data-testid="completion-sign-in-prompt"]').exists()).toBe(false);
  });

  it('shows the leaderboard entry recorded badge for authenticated ranked completions', () => {
    authenticate();
    const wrapper = mountDialog({ isCorrect: true, leaderboardEntryCreated: true });

    expect(wrapper.find('[data-testid="completion-stats"]').text()).toContain('Entry recorded');
  });
});

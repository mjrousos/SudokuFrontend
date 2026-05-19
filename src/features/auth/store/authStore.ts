import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { authApi, userProfileApi } from '../api/authApi';
import { ApiError } from '@/shared/api/problemDetails';
import { installHttpClient } from '@/shared/api/client';
import { etagCache } from '@/shared/api/etagCache';
import type { AuthProvider } from '@/shared/api/httpClient';
import {
  AUTH_BROADCAST_CHANNEL,
  createAuthBroadcast,
  type AuthBroadcast,
  withRefreshLock,
} from '@/shared/auth/crossTabRefresh';
import {
  clearPersistedRefresh,
  loadPersistedRefresh,
  savePersistedRefresh,
} from '@/shared/auth/tokenStorage';
import type {
  AuthTokenResponse,
  LoginRequest,
  RegisterRequest,
  UserProfileResponse,
} from '@/shared/api/types';

interface CurrentUser {
  userId: string;
  displayName: string;
  email?: string;
}

export const useAuthStore = defineStore('auth', () => {
  // In-memory access token + metadata. Never persisted.
  const accessToken = ref<string | null>(null);
  const accessTokenExpiresAt = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);
  const refreshTokenExpiresAt = ref<string | null>(null);
  const user = ref<CurrentUser | null>(null);
  const hydrating = ref<Promise<void> | null>(null);
  const hasHydrated = ref(false);

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null);
  const authIdentity = computed(() => user.value?.userId ?? null);

  let broadcast: AuthBroadcast | null = null;
  let inFlightRefresh: Promise<string | null> | null = null;

  // ---- HTTP client wiring ----
  const provider: AuthProvider = {
    getAccessToken: () => accessToken.value,
    getAuthIdentity: () => authIdentity.value,
    refresh: () => refreshAccessToken(),
    forceLogout: (reason) => {
      void forceLogout(reason);
    },
  };
  installHttpClient(provider);

  // ---- Broadcast wiring ----
  function ensureBroadcast(): AuthBroadcast {
    if (broadcast) return broadcast;
    broadcast = createAuthBroadcast(AUTH_BROADCAST_CHANNEL);
    broadcast.subscribe((msg) => {
      if (msg.type === 'tokens-updated') {
        applyTokens(
          {
            accessToken: msg.accessToken,
            accessTokenExpiresAt: msg.accessTokenExpiresAt,
            refreshToken: msg.refreshToken,
            refreshTokenExpiresAt: msg.refreshTokenExpiresAt,
            userId: msg.userId,
            displayName: msg.displayName,
          },
          { broadcast: false, persist: true },
        );
      } else if (msg.type === 'logged-out') {
        clearStateLocally();
      }
    });
    return broadcast;
  }
  ensureBroadcast();

  // ---- Helpers ----
  function applyTokens(
    res: AuthTokenResponse,
    options: { broadcast?: boolean; persist?: boolean } = {},
  ): void {
    const { broadcast: doBroadcast = true, persist = true } = options;

    // Identity changed? Reset cache.
    if (user.value && user.value.userId !== res.userId) {
      etagCache.clear();
    }

    accessToken.value = res.accessToken;
    accessTokenExpiresAt.value = res.accessTokenExpiresAt;
    refreshToken.value = res.refreshToken;
    refreshTokenExpiresAt.value = res.refreshTokenExpiresAt;
    user.value = {
      userId: res.userId,
      displayName: res.displayName,
      ...(user.value?.email ? { email: user.value.email } : {}),
    };

    if (persist) {
      savePersistedRefresh({
        refreshToken: res.refreshToken,
        refreshTokenExpiresAt: res.refreshTokenExpiresAt,
        userId: res.userId,
      });
    }
    if (doBroadcast) {
      ensureBroadcast().post({
        type: 'tokens-updated',
        accessToken: res.accessToken,
        accessTokenExpiresAt: res.accessTokenExpiresAt,
        refreshToken: res.refreshToken,
        refreshTokenExpiresAt: res.refreshTokenExpiresAt,
        userId: res.userId,
        displayName: res.displayName,
      });
    }
  }

  function clearStateLocally(): void {
    accessToken.value = null;
    accessTokenExpiresAt.value = null;
    refreshToken.value = null;
    refreshTokenExpiresAt.value = null;
    user.value = null;
    etagCache.clear();
  }

  async function forceLogout(reason: 'manual' | 'session_expired' | 'token_reused'): Promise<void> {
    hasHydrated.value = false;
    clearStateLocally();
    clearPersistedRefresh();
    ensureBroadcast().post({ type: 'logged-out', reason });
  }

  // ---- Actions ----

  async function hydrate(): Promise<void> {
    if (hasHydrated.value) return;
    if (hydrating.value) return hydrating.value;
    hydrating.value = (async () => {
      try {
        const persisted = loadPersistedRefresh();
        if (!persisted) return;
        // If expired, drop and bail.
        if (new Date(persisted.refreshTokenExpiresAt).getTime() <= Date.now()) {
          clearPersistedRefresh();
          return;
        }
        // Seed the refresh token so refreshAccessToken can use it.
        refreshToken.value = persisted.refreshToken;
        refreshTokenExpiresAt.value = persisted.refreshTokenExpiresAt;
        user.value = { userId: persisted.userId, displayName: '' };
        const fresh = await refreshAccessToken();
        if (fresh) {
          // Populate displayName/email from /users/me. Best-effort.
          try {
            const me = await userProfileApi.me();
            mergeProfile(me);
          } catch {
            // If this fails the user is still authenticated; profile will load later.
          }
        }
      } finally {
        hasHydrated.value = true;
      }
    })();
    try {
      await hydrating.value;
    } finally {
      hydrating.value = null;
    }
  }

  function mergeProfile(p: UserProfileResponse): void {
    if (!user.value) return;
    user.value = {
      ...user.value,
      userId: p.userId,
      displayName: p.displayName,
      email: p.email,
    };
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (inFlightRefresh) return inFlightRefresh;
    if (!refreshToken.value) return null;

    // Capture the access token we'd be refreshing FROM. If, by the time we
    // acquire the cross-tab lock, another tab has already refreshed and
    // broadcast a new token to us, our captured value will no longer match
    // `accessToken.value`. In that case we skip the network call entirely and
    // reuse the freshly broadcast access token — this is what prevents N tabs
    // from each firing a refresh when only one is needed.
    const enteredAccess = accessToken.value;

    inFlightRefresh = withRefreshLock(async () => {
      // Yield to the macrotask queue so any pending BroadcastChannel message
      // from another tab that just finished refreshing is processed before
      // we decide whether we still need to refresh. Without this, we can
      // enter the critical section before our handler runs, fire a redundant
      // refresh with a now-stale token, and get 401 token_reused.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      if (!refreshToken.value) return null;
      // Short-circuit: another tab beat us to it (access token rotated via
      // broadcast while we waited for the lock).
      if (accessToken.value !== null && accessToken.value !== enteredAccess) {
        return accessToken.value;
      }
      // Adopt the freshest refresh token from localStorage in case the
      // broadcast was missed but persistence wrote the new RT — this is a
      // belt-and-suspenders guard against token_reused on parallel tabs.
      const persisted = loadPersistedRefresh();
      const refreshTokenToUse = persisted?.refreshToken ?? refreshToken.value;
      if (!refreshTokenToUse) return null;
      try {
        const res = await authApi.refresh({ refreshToken: refreshTokenToUse });
        applyTokens(res);
        return res.accessToken;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        // The backend signals "another tab already used this token" with
        // title=token_reused; treat that as a hostile takeover and log out.
        if (apiErr?.title === 'token_reused') {
          await forceLogout('token_reused');
          return null;
        }
        // Any other 401 = our refresh token is no longer valid.
        if (apiErr?.status === 401) {
          await forceLogout('session_expired');
          return null;
        }
        // Network/server errors — keep state so a later attempt can retry.
        throw err;
      }
    });

    try {
      return await inFlightRefresh;
    } finally {
      inFlightRefresh = null;
    }
  }

  async function login(req: LoginRequest): Promise<void> {
    const res = await authApi.login(req);
    applyTokens(res);
    try {
      const me = await userProfileApi.me();
      mergeProfile(me);
    } catch {
      // non-fatal.
    }
  }

  async function register(req: RegisterRequest): Promise<{ requiresEmailConfirmation: boolean }> {
    const result = await authApi.register(req);
    return { requiresEmailConfirmation: result.requiresEmailConfirmation };
  }

  async function logout(): Promise<void> {
    hasHydrated.value = false;
    const rt = refreshToken.value;
    clearStateLocally();
    clearPersistedRefresh();
    ensureBroadcast().post({ type: 'logged-out', reason: 'manual' });
    if (rt) {
      try {
        await authApi.logout({ refreshToken: rt });
      } catch {
        // Best-effort; server-side may already have invalidated it.
      }
    }
  }

  async function logoutAllSessions(): Promise<void> {
    try {
      await authApi.logoutAll();
    } finally {
      await forceLogout('manual');
    }
  }

  async function requestPasswordReset(email: string): Promise<void> {
    await authApi.requestPasswordReset({ email });
  }

  async function confirmPasswordReset(args: {
    email: string;
    token: string;
    newPassword: string;
  }): Promise<void> {
    await authApi.confirmPasswordReset(args);
  }

  async function confirmEmail(userId: string, token: string): Promise<void> {
    await authApi.confirmEmail({ userId, token });
  }

  return {
    // state
    accessToken,
    accessTokenExpiresAt,
    user,
    isAuthenticated,
    authIdentity,
    // actions
    hydrate,
    login,
    register,
    logout,
    logoutAllSessions,
    refreshAccessToken,
    requestPasswordReset,
    confirmPasswordReset,
    confirmEmail,
    mergeProfile,
    // exposed for tests
    _applyTokens: applyTokens,
    _clearStateLocally: clearStateLocally,
  };
});

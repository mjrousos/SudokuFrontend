import type { NavigationGuard } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';

/**
 * Awaits the auth store's hydration (silent refresh on boot) before letting
 * the first navigation through, so meta.requiresAuth / meta.guestOnly checks
 * see the actual authenticated state.
 */
export const authGuard: NavigationGuard = async (to) => {
  const auth = useAuthStore();
  await auth.hydrate();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirectTo: to.fullPath },
    };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' };
  }
  return true;
};

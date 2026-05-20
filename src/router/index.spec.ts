import { describe, expect, it } from 'vitest';

import { router } from './index';

describe('router auth metadata', () => {
  it('allows anonymous access to gameplay routes permitted by backend', () => {
    const newGameRoute = router.getRoutes().find((r) => r.name === 'play.new');
    const playGameRoute = router.getRoutes().find((r) => r.name === 'play.game');

    expect(newGameRoute?.meta.requiresAuth).toBeFalsy();
    expect(playGameRoute?.meta.requiresAuth).toBeFalsy();
  });

  it('keeps profile and my-stats routes protected', () => {
    const profileRoute = router.getRoutes().find((r) => r.name === 'profile');
    const statsRoute = router.getRoutes().find((r) => r.name === 'stats');

    expect(profileRoute?.meta.requiresAuth).toBe(true);
    expect(statsRoute?.meta.requiresAuth).toBe(true);
  });
});

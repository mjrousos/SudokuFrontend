import { describe, expect, it } from 'vitest';

import { router } from './index';

function requiresAuth(name: string): unknown {
  return router.getRoutes().find((route) => route.name === name)?.meta.requiresAuth;
}

describe('router auth metadata', () => {
  it('allows anonymous access to game play routes', () => {
    expect(requiresAuth('play.new')).toBeUndefined();
    expect(requiresAuth('play.game')).toBeUndefined();
  });

  it('still requires auth for profile and private stats routes', () => {
    expect(requiresAuth('profile')).toBe(true);
    expect(requiresAuth('stats')).toBe(true);
  });
});

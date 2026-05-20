import { describe, expect, it } from 'vitest';

import { router } from './index';

describe('router gameplay auth requirements', () => {
  it('does not require auth for new games', () => {
    const route = router.resolve({ name: 'play.new' });
    expect(route.meta.requiresAuth).toBeUndefined();
  });

  it('does not require auth for existing game routes', () => {
    const route = router.resolve('/play/test-game-id');
    expect(route.meta.requiresAuth).toBeUndefined();
  });
});

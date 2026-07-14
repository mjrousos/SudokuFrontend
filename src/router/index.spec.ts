import { describe, expect, it } from 'vitest';

import { router } from './index';

describe('router gameplay access', () => {
  it('allows anonymous users to reach new-game and play-game routes', () => {
    expect(router.resolve({ name: 'play.new' }).meta.requiresAuth).toBeUndefined();
    expect(
      router.resolve({ name: 'play.game', params: { gameId: 'guest-game' } }).meta.requiresAuth,
    ).toBeUndefined();
  });
});

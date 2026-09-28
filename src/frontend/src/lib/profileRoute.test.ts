import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { profileLocation } from './profileRoute';

// profileLocation() is a thin wrapper around modalLocation() (see
// modalRoute.test.ts for the shared backgroundView-stashing/no-stacking
// behaviour) — these tests only cover the profile-specific path shape it
// adds on top: own profile vs. `/profile/:userName`.

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/profile', name: 'own-profile', component: { template: '<div />' } },
      { path: '/profile/:userName', name: 'profile', component: { template: '<div />' } },
    ],
  });
}

describe('profileLocation', () => {
  it("builds '/profile' with the caller's current path stashed as the background view", async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(profileLocation(router)).toEqual({ path: '/profile', state: { backgroundView: '/settlement' } });
  });

  it("builds '/profile/:userName' for someone else's profile", async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(profileLocation(router, 'floki')).toEqual({
      path: '/profile/floki',
      state: { backgroundView: '/settlement' },
    });
  });

  it('reuses the existing backgroundView instead of stacking a profile behind a profile', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });

    expect(profileLocation(router, 'floki')).toEqual({
      path: '/profile/floki',
      state: { backgroundView: '/settlement' },
    });
  });

  it('has no state when opened from a profile route with no backgroundView of its own (direct load)', async () => {
    const router = testRouter();
    await router.push('/profile/ragnar');

    expect(profileLocation(router, 'floki')).toEqual({ path: '/profile/floki', state: undefined });
  });
});

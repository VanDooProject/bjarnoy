import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { profileLocation } from './profileRoute';

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
  it("stashes the caller's current path as the background view, for its own profile", async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(profileLocation(router)).toEqual({ path: '/profile', state: { backgroundView: '/settlement' } });
  });

  it("stashes the caller's current path as the background view, for someone else's profile", async () => {
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

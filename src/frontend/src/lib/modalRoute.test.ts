import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { backgroundViewPath, closeModalRoute, isModalRouteName, modalLocation, reportsLocation, settingsLocation } from './modalRoute';

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/profile', name: 'own-profile', component: { template: '<div />' } },
      { path: '/profile/:userName', name: 'profile', component: { template: '<div />' } },
      { path: '/leaderboards', name: 'leaderboards', component: { template: '<div />' } },
      { path: '/guild', name: 'guild', component: { template: '<div />' } },
      { path: '/reports', name: 'reports', component: { template: '<div />' } },
      { path: '/reports/:reportId', name: 'report-detail', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

describe('isModalRouteName', () => {
  it('is true for every modal route name', () => {
    expect(isModalRouteName('own-profile')).toBe(true);
    expect(isModalRouteName('profile')).toBe(true);
    expect(isModalRouteName('leaderboards')).toBe(true);
    expect(isModalRouteName('guild')).toBe(true);
    expect(isModalRouteName('reports')).toBe(true);
    expect(isModalRouteName('report-detail')).toBe(true);
    expect(isModalRouteName('settings')).toBe(true);
  });

  it('is false for a non-modal route name, undefined, or null', () => {
    expect(isModalRouteName('settlement')).toBe(false);
    expect(isModalRouteName(undefined)).toBe(false);
    expect(isModalRouteName(null)).toBe(false);
  });
});

describe('modalLocation', () => {
  it("stashes the caller's current path as the background view", async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(modalLocation(router, '/leaderboards')).toEqual({
      path: '/leaderboards',
      state: { backgroundView: '/settlement' },
    });
  });

  it('reuses the existing backgroundView instead of stacking a modal behind a modal (profile -> leaderboards)', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });

    expect(modalLocation(router, '/leaderboards')).toEqual({
      path: '/leaderboards',
      state: { backgroundView: '/settlement' },
    });
  });

  it('reuses the existing backgroundView instead of stacking a modal behind a modal (leaderboards -> guild)', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/leaderboards', state: { backgroundView: '/settlement' } });

    expect(modalLocation(router, '/guild')).toEqual({
      path: '/guild',
      state: { backgroundView: '/settlement' },
    });
  });

  it('has no state when opened from a modal route with no backgroundView of its own (direct load)', async () => {
    const router = testRouter();
    await router.push('/leaderboards');

    expect(modalLocation(router, '/guild')).toEqual({ path: '/guild', state: undefined });
  });
});

describe('reportsLocation', () => {
  it('stashes the caller\'s current path as the background view, for the list', async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(reportsLocation(router)).toEqual({ path: '/reports', state: { backgroundView: '/settlement' } });
  });

  it('stashes the background view for a specific report id', async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(reportsLocation(router, 'report-1')).toEqual({
      path: '/reports/report-1',
      state: { backgroundView: '/settlement' },
    });
  });

  it('reuses the existing backgroundView from list to detail, instead of stacking reports behind reports', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });

    expect(reportsLocation(router, 'report-1')).toEqual({
      path: '/reports/report-1',
      state: { backgroundView: '/settlement' },
    });
  });

  it('has no state when opened from a report-detail route with no backgroundView of its own (direct load)', async () => {
    const router = testRouter();
    await router.push('/reports/report-1');

    expect(reportsLocation(router)).toEqual({ path: '/reports', state: undefined });
  });
});

describe('settingsLocation', () => {
  it("stashes the caller's current path as the background view", async () => {
    const router = testRouter();
    await router.push('/settlement');

    expect(settingsLocation(router)).toEqual({ path: '/settings', state: { backgroundView: '/settlement' } });
  });

  it('reuses the existing backgroundView when opened from another modal', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });

    expect(settingsLocation(router)).toEqual({ path: '/settings', state: { backgroundView: '/settlement' } });
  });
});

describe('closeModalRoute', () => {
  it('goes back to the background view when that is the entry we came from', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });

    closeModalRoute(router);
    await new Promise((r) => setTimeout(r, 0));

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('replaces with the background view on a direct load, and falls back to /settlement without one', async () => {
    const router = testRouter();
    await router.push({ path: '/reports', state: { backgroundView: '/guild' } });
    closeModalRoute(router);
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe('/guild');

    await router.push('/reports');
    closeModalRoute(router);
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe('/settlement');
  });
});

describe('backgroundViewPath', () => {
  it('is the path of the stashed background view, without its hash', async () => {
    const router = testRouter();
    await router.push({ path: '/reports', state: { backgroundView: '/settlement#world&q=1&r=2&z=0.30' } });

    expect(backgroundViewPath(router)).toBe('/settlement');
  });

  it('is null on a direct load', async () => {
    const router = testRouter();
    await router.push('/reports');

    expect(backgroundViewPath(router)).toBeNull();
  });
});

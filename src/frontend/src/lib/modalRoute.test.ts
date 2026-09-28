import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { isModalRouteName, reportsLocation } from './modalRoute';
import { profileLocation } from './profileRoute';

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/profile', name: 'own-profile', component: { template: '<div />' } },
      { path: '/profile/:userName', name: 'profile', component: { template: '<div />' } },
      { path: '/reports', name: 'reports', component: { template: '<div />' } },
      { path: '/reports/:reportId', name: 'report-detail', component: { template: '<div />' } },
    ],
  });
}

describe('isModalRouteName', () => {
  it('recognizes every modal route name', () => {
    expect(isModalRouteName('own-profile')).toBe(true);
    expect(isModalRouteName('profile')).toBe(true);
    expect(isModalRouteName('reports')).toBe(true);
    expect(isModalRouteName('report-detail')).toBe(true);
  });

  it('rejects background routes and non-string names', () => {
    expect(isModalRouteName('settlement')).toBe(false);
    expect(isModalRouteName(undefined)).toBe(false);
    expect(isModalRouteName(null)).toBe(false);
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

describe('cross-modal backgroundView reuse', () => {
  it('profile → reports keeps the original background rather than the profile route', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });

    expect(reportsLocation(router)).toEqual({ path: '/reports', state: { backgroundView: '/settlement' } });
  });

  it('reports → profile keeps the original background rather than the reports route', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/reports', state: { backgroundView: '/settlement' } });

    expect(profileLocation(router, 'floki')).toEqual({
      path: '/profile/floki',
      state: { backgroundView: '/settlement' },
    });
  });
});

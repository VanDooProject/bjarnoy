import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { resolveAuthGuard } from './authGuard';

function routeTo(meta: RouteLocationNormalized['meta'], fullPath = '/some/path'): RouteLocationNormalized {
  return { meta, fullPath } as RouteLocationNormalized;
}

describe('resolveAuthGuard', () => {
  it('lets an unauthenticated visitor through to a route with no auth requirement', () => {
    const result = resolveAuthGuard(routeTo({}), { isAuthenticated: false, isAdmin: false });
    expect(result).toBe(true);
  });

  it('redirects an unauthenticated visitor to /login with a redirect query for requiresAuth', () => {
    const result = resolveAuthGuard(
      routeTo({ requiresAuth: true }, '/settlement'),
      { isAuthenticated: false, isAdmin: false },
    );
    expect(result).toEqual({ path: '/login', query: { redirect: '/settlement' } });
  });

  it('redirects an unauthenticated visitor to /login for requiresAdmin too', () => {
    const result = resolveAuthGuard(
      routeTo({ requiresAdmin: true }, '/admin'),
      { isAuthenticated: false, isAdmin: false },
    );
    expect(result).toEqual({ path: '/login', query: { redirect: '/admin' } });
  });

  it('lets an authenticated non-admin through to a requiresAuth route', () => {
    const result = resolveAuthGuard(routeTo({ requiresAuth: true }), { isAuthenticated: true, isAdmin: false });
    expect(result).toBe(true);
  });

  it('redirects an authenticated non-admin away from a requiresAdmin route, to / rather than /login', () => {
    const result = resolveAuthGuard(routeTo({ requiresAdmin: true }), { isAuthenticated: true, isAdmin: false });
    expect(result).toEqual({ path: '/' });
  });

  it('lets an authenticated admin through to a requiresAdmin route', () => {
    const result = resolveAuthGuard(routeTo({ requiresAdmin: true }), { isAuthenticated: true, isAdmin: true });
    expect(result).toBe(true);
  });
});

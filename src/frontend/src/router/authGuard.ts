import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

/** The subset of the auth store's state this guard actually reads — kept narrow so it's easy to fake in a test. */
export interface AuthGuardState {
  isAuthenticated: boolean;
  isAdmin: boolean;
}

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
  }
}

/**
 * Pure redirect decision for the `requiresAuth`/`requiresAdmin` route meta
 * flags — split out from `router/index.ts`'s `beforeEach` so it can be unit
 * tested without a real router or a mounted app (this project's Vitest setup
 * runs in a Node environment with no DOM — see `vitest.config.ts`).
 *
 * - Unauthenticated hitting `requiresAuth`/`requiresAdmin` → `/login?redirect=<path>`.
 * - Authenticated-non-admin hitting `requiresAdmin` → `/` (not `/login`, so
 *   as not to leak that an admin-only route exists to someone who is merely
 *   not an admin).
 */
export function resolveAuthGuard(
  to: RouteLocationNormalized,
  auth: AuthGuardState,
): RouteLocationRaw | true {
  const needsAuth = to.meta.requiresAuth === true || to.meta.requiresAdmin === true;

  if (needsAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (to.meta.requiresAdmin === true && !auth.isAdmin) {
    return { path: '/' };
  }

  return true;
}

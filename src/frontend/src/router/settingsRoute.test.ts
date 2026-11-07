// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { router } from './index';
import { resolveAuthGuard } from './authGuard';
import { isModalRouteName } from '../lib/modalRoute';

describe('/settings route', () => {
  it('is a modal route that needs no account', () => {
    const resolved = router.resolve('/settings');

    expect(resolved.name).toBe('settings');
    expect(isModalRouteName(resolved.name)).toBe(true);
    expect(resolved.meta.requiresAuth).toBeFalsy();
    expect(resolveAuthGuard(resolved as Parameters<typeof resolveAuthGuard>[0], { isAuthenticated: false, isAdmin: false })).toBe(true);
  });
});

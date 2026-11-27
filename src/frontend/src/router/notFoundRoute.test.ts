// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { router } from './index';
import { resolveAuthGuard } from './authGuard';

describe('catch-all route', () => {
  it.each(['/does-not-exist', '/docs/no-such-page/deeper', '/admin/nope'])(
    'resolves unknown path %s to the not-found page without needing an account',
    (path) => {
      const resolved = router.resolve(path);
      expect(resolved.name).toBe('not-found');
      expect(resolveAuthGuard(resolved as Parameters<typeof resolveAuthGuard>[0], { isAuthenticated: false, isAdmin: false })).toBe(true);
    },
  );

  it('does not swallow known routes', () => {
    expect(router.resolve('/settlement').name).toBe('settlement');
    expect(router.resolve('/docs/tiles').name).toBe('tile-docs');
  });
});

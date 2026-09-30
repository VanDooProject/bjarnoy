import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { AdminActivityPage } from './pages';
import { layoutOverflow } from './helpers';

// Second mobile-readiness sweep (after mobile.spec.ts): defects found by
// walking every page at phone sizes, portrait and landscape. The desktop
// suite's fixed 1280x800 viewport can't see any of them.
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

async function expectFullyInViewport(page: Page, locator: Locator, what: string): Promise<void> {
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box, `${what}: not rendered`).not.toBeNull();
  expect(box.x, `${what}: past the left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${what}: past the right edge`).toBeLessThanOrEqual(viewport.width + 1);
}

async function mockAdminActivity(page: Page): Promise<AdminActivityPage> {
  const activity = new AdminActivityPage(page);
  await activity.mockApi({
    buckets: [{ bucketStart: '2026-08-29T00:00:00Z', activeUserCount: 1 }],
    users: Array.from({ length: 5 }, (_, i) => ({
      userId: `user-${i}`,
      userName: `a-rather-long-player-name-${i}`,
      displayName: `Player with a long display name ${i}`,
      lastActiveAtUtc: new Date(Date.now() - i * 60_000).toISOString(),
    })),
  });
  return activity;
}

for (const [name, viewport] of [
  ['portrait', PHONE],
  ['landscape', PHONE_LANDSCAPE],
] as const) {
  test.describe(`admin shell on a phone, ${name}`, { tag: '@g2' }, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    // The admin header was one row (brand, seven tabs, world picker,
    // account): on a phone the picker and "Log out" sat past the right
    // edge with no way to reach them, and a wide table dragged the whole
    // page sideways with it.
    test('keeps "Log out" and every tab reachable, and wide tables scroll on their own', async ({ page, adminAuth }) => {
      await adminAuth.login();
      const activity = await mockAdminActivity(page);
      await activity.goto();
      await expect(activity.userRows).toHaveCount(5);

      await expectFullyInViewport(page, page.getByRole('button', { name: 'Log out' }), 'Log out');
      const { pageScrollsSideways, offscreen } = await layoutOverflow(page);
      expect(pageScrollsSideways).toBe(false);
      expect(offscreen).toEqual([]);

      const tools = page.getByRole('link', { name: 'Tools' });
      await tools.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, tools, 'last tab');
      await tools.click();
      await expect(page).toHaveURL(/\/admin\/island-lab$/);
      await expectFullyInViewport(page, page.getByRole('button', { name: 'Log out' }), 'Log out after switching tabs');
    });
  });
}

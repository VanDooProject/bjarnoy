import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Same bug class as docs.spec.ts (#101), one level up: `.admin`
 * (AdminLayout.vue, the shared shell every /admin/* tab renders inside)
 * had `width: 100vw; min-height: 100vh` with no `overflow` of its own —
 * worse than the docs pages, which at least attempted `overflow: auto`.
 * With `min-height` and no constrained box, and `body { overflow: hidden }`
 * clipping the actual page (style.css, needed by the map views), any admin
 * tab whose content ran past one screen (e.g. a full page of activity
 * users under its chart) was simply unreachable — no scrollbar anywhere.
 *
 * Runs against demo mode like admin-activity.spec.ts: a mocked admin
 * session and a full page of activity users, past the `requiresAdmin`
 * router guard.
 */

const ADMIN_USER = { id: 'admin-1', userName: 'e2e-admin', role: 'admin', status: 'active', displayName: 'E2E Admin' };

async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bjarnoy.refreshToken', 'seed-refresh-admin'));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: ADMIN_USER } }),
  );
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: ADMIN_USER }));
}

async function mockActivityApi(page: Page) {
  await page.route('**/api/v1/admin/activity/summary*', (route: Route) =>
    route.fulfill({
      json: {
        from: '2026-08-22T00:00:00.000Z',
        to: '2026-08-29T23:59:59.999Z',
        bucket: 'day',
        buckets: [{ bucketStart: '2026-08-29T00:00:00Z', activeUserCount: 1 }],
      },
    }),
  );
  // A full page of rows (pageSize is 25 — see AdminActivityView.vue) is
  // what actually pushes the table past one screen at the fixed 800px
  // test viewport.
  const items = Array.from({ length: 25 }, (_, i) => ({
    userId: `user-${i}`,
    userName: `player-${i}`,
    displayName: `Player ${i}`,
    lastActiveAtUtc: new Date(Date.now() - i * 60_000).toISOString(),
  }));
  await page.route('**/api/v1/admin/activity/users*', (route: Route) =>
    route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 25 } }),
  );
}

test('admin pages scroll to reveal content below the fold', async ({ page }) => {
  await loginAsAdmin(page);
  await mockActivityApi(page);

  await page.goto('/admin/activity');
  const rows = page.locator('tr.user-row');
  await expect(rows).toHaveCount(25);
  const lastRow = rows.last();

  const root = page.locator('.admin');
  const { scrollHeight, clientHeight } = await root.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  await expect(lastRow).not.toBeInViewport();

  await root.hover();
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => root.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(lastRow).toBeInViewport();

  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
});

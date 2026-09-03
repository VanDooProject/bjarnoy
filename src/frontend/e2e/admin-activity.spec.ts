import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Like leaderboard.spec.ts, this runs against demo mode (see
 * playwright.config.ts's webServer — `vite preview` with no backend behind
 * it), so it mocks the API rather than standing up a real one. The
 * Aspire-orchestrated suite (`src/backend/tests/Bjarnoy.AppHost.Tests`) is
 * where a real login + real endpoint-filter-tracked activity would round
 * -trip through an actual database; that suite's existing specs
 * (`FoundingSettlementPersistenceTests`, `ProfileEditPersistenceTests`) are
 * each a single frontend/backend *wiring* proof for one flow, not a
 * per-admin-area pattern, so no third admin-scoped case was added there —
 * see this PR's summary for the full reasoning.
 *
 * This spec's job is AdminActivityView's own rendering/state logic: an admin
 * reaches the page (past the `requiresAdmin` router guard), the users table
 * shows the admin's own row with a recent last-active value, and the
 * aggregate chart actually mounts a Chart.js canvas from the summary data.
 */

const ADMIN_USER = { id: 'admin-1', userName: 'e2e-admin', role: 'admin', status: 'active', displayName: 'E2E Admin' };

/**
 * Same shape as leaderboard.spec.ts's `loginAs`: seeds a refresh token so
 * `authStore.ensureInitialized()` (awaited by the router guard on every
 * navigation) calls `tryRefresh()`, then intercepts that call and the
 * follow-up `fetchMe()` so the session sticks. `role: 'admin'` is what
 * `authStore.isAdmin` checks (see `stores/auth.ts`), which is what lets this
 * session past the `/admin` route's `requiresAdmin` guard.
 */
async function loginAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bjarnoy.refreshToken', 'seed-refresh-admin'));
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: ADMIN_USER } }),
  );
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: ADMIN_USER }));
}

/** A recent (well within "today") ISO timestamp for the admin's own last-active value. */
function recentIso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

/**
 * Wires up the three admin activity endpoints AdminActivityView calls,
 * before the page ever navigates. The admin's own user row (with a recent
 * `lastActiveAtUtc`) stands in for the real activity the endpoint filter
 * would have recorded from this same session's earlier authenticated
 * requests — see the file-level comment for why this suite mocks rather
 * than tracks for real.
 */
async function mockActivityApi(page: Page) {
  await page.route('**/api/v1/admin/activity/summary*', (route: Route) =>
    route.fulfill({
      json: {
        from: '2026-08-22T00:00:00.000Z',
        to: '2026-08-29T23:59:59.999Z',
        bucket: 'day',
        buckets: [
          { bucketStart: '2026-08-27T00:00:00Z', activeUserCount: 2 },
          { bucketStart: '2026-08-28T00:00:00Z', activeUserCount: 3 },
          { bucketStart: '2026-08-29T00:00:00Z', activeUserCount: 1 },
        ],
      },
    }),
  );
  await page.route('**/api/v1/admin/activity/users*', (route: Route) =>
    route.fulfill({
      json: {
        items: [
          { userId: ADMIN_USER.id, userName: ADMIN_USER.userName, displayName: ADMIN_USER.displayName, lastActiveAtUtc: recentIso(1) },
          { userId: 'user-2', userName: 'other-player', displayName: 'Other Player', lastActiveAtUtc: recentIso(120) },
        ],
        totalCount: 2,
        page: 1,
        pageSize: 25,
      },
    }),
  );
}

test.describe('admin activity view', { tag: '@g2' }, () => {
  test('shows the logged-in admin as a recently active user and renders the aggregate chart', async ({ page }) => {
    await loginAsAdmin(page);
    await mockActivityApi(page);
    // ProfileView's own-profile fetch — a plain authenticated GET, standing
    // in for the "perform an authenticated action first" step: in the real
    // stack this request (like every authenticated request) would have run
    // through UserActivityEndpointFilter and updated the admin's
    // last-active timestamp before the activity view is ever opened.
    await page.route(`**/api/v1/profiles/by-name/${ADMIN_USER.userName}`, (route: Route) =>
      route.fulfill({
        json: {
          id: ADMIN_USER.id,
          userName: ADMIN_USER.userName,
          displayName: ADMIN_USER.displayName,
          bio: null,
          createdAt: '2026-01-01T00:00:00Z',
          settlementCount: 0,
        },
      }),
    );

    // Step 2 of the scenario: an authenticated page visited before the
    // activity view, exercising the same auth/session path a real
    // heartbeat-tracked request would.
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Add a bio' })).toBeVisible();

    // Step 3: navigate to the admin activity view via the real admin nav,
    // not a direct page.goto — proves the requiresAdmin guard and AdminLayout
    // tab both work for this route, not just AdminActivityView in isolation.
    await page.goto('/admin/worlds');
    await page.getByRole('link', { name: 'Activity' }).click();
    await page.waitForURL('**/admin/activity');

    // Step 4a: the admin's own row appears with a recent last-active value —
    // not "Never" (the no-activity-yet rendering) and not the other user's
    // 2-hour-old timestamp.
    const adminRow = page.locator('tr.user-row', { hasText: ADMIN_USER.userName });
    await expect(adminRow).toBeVisible();
    await expect(adminRow).not.toContainText('Never');

    // Step 4b: the aggregate chart mounted a real Chart.js canvas with
    // non-zero dimensions — not asserting pixel content, just that the
    // underlying data-loaded state was reached and something actually
    // rendered rather than the "No activity data" empty state.
    await expect(page.locator('.activity-chart .empty')).toHaveCount(0);
    const canvas = page.locator('.canvas-wrap canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});

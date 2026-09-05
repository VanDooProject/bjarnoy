import { expect, test } from './fixtures';
import { AdminActivityPage } from './pages';

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

test('admin pages scroll to reveal content below the fold', { tag: '@g2' }, async ({ page, adminAuth }) => {
  const activity = new AdminActivityPage(page);
  await adminAuth.login();
  // A full page of rows (pageSize is 25 — see AdminActivityView.vue) is
  // what actually pushes the table past one screen at the fixed 800px
  // test viewport.
  await activity.mockApi({
    buckets: [{ bucketStart: '2026-08-29T00:00:00Z', activeUserCount: 1 }],
    users: Array.from({ length: 25 }, (_, i) => ({
      userId: `user-${i}`,
      userName: `player-${i}`,
      displayName: `Player ${i}`,
      lastActiveAtUtc: new Date(Date.now() - i * 60_000).toISOString(),
    })),
  });

  await activity.goto();
  await expect(activity.userRows).toHaveCount(25);
  const lastRow = activity.userRows.last();

  const { scrollHeight, clientHeight } = await activity.shell.metrics();
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  await expect(lastRow).not.toBeInViewport();

  await activity.shell.wheel(5000);
  await expect(lastRow).toBeInViewport();

  expect(await activity.shell.noHorizontalOverflow()).toBe(true);
});

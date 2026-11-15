import { expect, test } from '../fixtures';
import { ADMIN_USER, AdminActivityPage } from '../pages';
import { expectScreen, freezeClock } from './screen';

test.use({ mapLayers: { water: false, fog: false }, mapMotion: { hud: 'off' } });

const T0 = new Date('2026-06-01T12:00:00Z');

test('admin-activity', async ({ page, adminAuth }) => {
  await freezeClock(page);
  await adminAuth.login();
  const activity = new AdminActivityPage(page);
  await activity.mockApi({
    buckets: [
      { bucketStart: '2026-05-26T00:00:00Z', activeUserCount: 4 },
      { bucketStart: '2026-05-27T00:00:00Z', activeUserCount: 7 },
      { bucketStart: '2026-05-28T00:00:00Z', activeUserCount: 5 },
      { bucketStart: '2026-05-29T00:00:00Z', activeUserCount: 9 },
      { bucketStart: '2026-05-30T00:00:00Z', activeUserCount: 6 },
      { bucketStart: '2026-05-31T00:00:00Z', activeUserCount: 3 },
      { bucketStart: '2026-06-01T00:00:00Z', activeUserCount: 8 },
    ],
    users: [
      { userId: ADMIN_USER.id, userName: ADMIN_USER.userName, displayName: ADMIN_USER.displayName, lastActiveAtUtc: '2026-06-01T11:59:00Z' },
      { userId: 'user-2', userName: 'other-player', displayName: 'Other Player', lastActiveAtUtc: '2026-06-01T10:00:00Z' },
      { userId: 'user-3', userName: 'third-player', displayName: null, lastActiveAtUtc: '2026-05-29T08:30:00Z' },
    ],
  });
  await activity.goto();
  await expect(activity.userRows).toHaveCount(3);
  await expect(activity.chartCanvas).toBeVisible();
  await activity.finishChartAnimation(T0);
  await expectScreen(page, 'admin-activity');
});

import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { clickHudMenuEntry, loginTestUser } from './helpers';
import { AdminTablePage, LeaderboardPage, LEADERBOARD_WORLD_ID, SettlementPage, scoreEntry } from './pages';

/**
 * Demo mode (what `npm run test:e2e` runs against — see playwright.config.ts
 * and config.ts) has no backend behind it: `world.worldId` only ever gets
 * set by `bootstrapLiveWorld()` talking to a real API, which is a no-op in
 * demo mode. LeaderboardView renders its own "No live world" hint whenever
 * `worldId` is null, so there's no code path in demo mode that ever reaches
 * the leaderboard directory/board fetches on its own.
 *
 * So this spec seeds `bjarnoy.worldId` into localStorage before the app
 * boots (the same key `stores/world.ts` reads it from) and intercepts the
 * `/api/v1/worlds/:id/leaderboards...` calls via `page.route`, rather than
 * standing up a real world/settlements/users just to get a worldId — the
 * Aspire-orchestrated job (`aspire-e2e.yml`) is what exercises the real
 * backend end-to-end; this spec's job is the view's own rendering/state
 * logic against known response shapes.
 */

test.describe('leaderboards', { tag: '@g2' }, () => {
  test('is reachable via the HUD nav link from the world map, opening as a modal over the map', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // landing-page-defects.md L1 means HudNav itself is no longer mounted
    // pre-founding at all, so founding first is the lightest way to reach
    // any HudNav link now. Returning-player nav work then layered an
    // `auth.isAuthenticated` requirement on top of Leaderboards specifically
    // (previously unconditioned — see HudNav.vue), so a real session is
    // needed too.
    await loginTestUser(page);
    await SettlementPage.found(page);
    await clickHudMenuEntry(page, 'Leaderboards');
    await page.waitForURL('**/leaderboards');

    // Owner decision: leaderboards opens as a modal over whatever page was
    // showing before (App.vue's modal-route pattern, lib/modalRoute.ts),
    // exactly like the profile modal — not a full-page navigation.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Leaderboards', level: 1 })).toBeVisible();
    // The settlement map underneath is still mounted, not swapped out.
    await expect(page.locator('canvas')).toBeVisible();

    // Closing returns to a bare /settlement with no modal left behind.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/settlement(#q=[^#]*)?$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows the no-live-world hint when no world has been joined', async ({ page }) => {
    await page.goto('/leaderboards');
    await expect(page.getByText('No live world to show leaderboards for.')).toBeVisible();
  });

  test('renders the category/scope tabs from the directory response and switches between a live and a dark board', async ({
    page,
  }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await leaderboard.goto();

    // Two "Score" boards in the rail: one per scope group (Players, Guilds), and the caller's rank on the live one.
    const tabs = leaderboard.scoreTabs;
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first()).toContainText('#2');

    // The first board in the directory (user/score, live) is auto-selected
    // on mount — a real table with the mocked rows.
    const board = new AdminTablePage(page);
    await expect(board.table).toBeVisible();
    await expect(board.rows).toHaveCount(2);
    await expect(page.getByText('Player 1')).toBeVisible();

    // Switching to the guild/score tab (always noGuildSystemYet today,
    // per LeaderboardCatalogue.cs) shows the dark-board reason instead of a
    // table — it's opted-out of the live-board fetch entirely.
    await tabs.nth(1).click();
    await expect(board.table).toHaveCount(0);
    await expect(page.locator('.locked')).toHaveText('Unlocks once guilds exist.');
  });

  test('"Load more" appends further rows and disappears once the board is exhausted', async ({ page }) => {
    // Two pages is enough to exercise the append + cursor-exhaustion logic
    // without fabricating a large dataset — LeaderboardView.vue's own
    // `nextAfterRank`/`loadPage` handling doesn't care how many rows are on
    // either side of that boundary, only whether one exists.
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({
      first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: 2 },
      '2': { items: [scoreEntry(3)], nextAfterRank: null },
    });
    await leaderboard.goto();

    const board = new AdminTablePage(page);
    await expect(board.rows).toHaveCount(2);
    const loadMore = page.getByRole('button', { name: 'Load more' });
    await expect(loadMore).toBeEnabled();

    await loadMore.click();
    await expect(board.rows).toHaveCount(3);
    await expect(page.getByText('Player 3')).toBeVisible();

    // No more pages left — the pager button is disabled rather than
    // removed (see LeaderboardView.vue's `:disabled` binding), which also
    // stops it re-reading as "Load more" while a real click would no-op.
    await expect(loadMore).toBeDisabled();
  });

  test('"Jump to my rank" is hidden when logged out', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1)], nextAfterRank: null } });
    await leaderboard.goto();

    await expect(page.getByRole('button', { name: 'Jump to my rank' })).toHaveCount(0);
  });

  test('"Jump to my rank" is visible and functional when logged in', async ({ page, adminAuth }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await adminAuth.loginAsPlayer('e2e-player');
    // `jumpToMyRank()` is called with no `subjectId`, so the real request
    // has no query string at all — `*` (matching zero or more chars) covers
    // that, unlike glob's `?` (exactly one char).
    await page.route(`**/api/v1/worlds/${LEADERBOARD_WORLD_ID}/leaderboards/user/score/me*`, (route: Route) =>
      route.fulfill({
        // Rank 7 is the logged-in player (AdminAuthFixture.loginAsPlayer's `user-1`), which is what marks the own row.
        json: { myRank: 7, items: [scoreEntry(6), { ...scoreEntry(7), subjectId: 'user-1' }, scoreEntry(8)] },
      }),
    );
    await leaderboard.goto();

    const jumpBtn = page.getByRole('button', { name: 'Jump to my rank' });
    await expect(jumpBtn).toBeVisible();

    await jumpBtn.click();
    // jumpToMyRank() replaces `entries` outright with the /me window, so
    // the table should now show rank 7's neighbourhood, not the original
    // page-1 rows.
    const board = new AdminTablePage(page);
    await expect(page.getByText('Player 7')).toBeVisible();
    await expect(board.rows).toHaveCount(3);
    await expect(board.myRow).toContainText('Player 7 · yours');
  });
  test('marks the player own row on the board', async ({ page, adminAuth }) => {
    // `loginAsPlayer` is `user-1`, which `scoreEntry(1)` carries as its subject id.
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await adminAuth.loginAsPlayer('e2e-player');
    await leaderboard.goto();

    await expect(new AdminTablePage(page).myRow).toHaveCount(1);
    await expect(new AdminTablePage(page).myRow).toContainText('Player 1 · yours');
  });

  test('the week stepper is locked for a free player and steps through the weeks for a premium one', async ({ page, adminAuth }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1)], nextAfterRank: null } });
    await adminAuth.loginAsPlayer('e2e-player');
    await leaderboard.goto();
    await leaderboard.boardsNav.getByRole('button', { name: 'Weekly score gained' }).click();

    await expect(page.getByTestId('week-earlier')).toBeDisabled();
    await expect(page.getByTestId('week-premium-note')).toHaveText('Premium: the last 4 weeks');
    await expect(page.getByText('Final', { exact: true })).toBeVisible();
  });

  test('a premium player can step to the earlier week', async ({ page, adminAuth }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1)], nextAfterRank: null } });
    await adminAuth.loginAsPlayer('e2e-player', { isPremium: true });
    await leaderboard.goto();
    await leaderboard.boardsNav.getByRole('button', { name: 'Weekly score gained' }).click();

    const earlier = page.getByTestId('week-earlier');
    await expect(earlier).toBeEnabled();
    await expect(page.getByTestId('week-premium-note')).toHaveCount(0);
    const request = page.waitForRequest((r) => r.url().includes('weeklyScoreGained?periodStart='));
    await earlier.click();
    expect(new URL((await request).url()).searchParams.get('periodStart')).toContain('2026-07-01');
    await expect(page.locator('.week-label')).toContainText('Week of');
  });
});

test.describe('leaderboards on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('lists the boards first, drills into one, and the back chevron returns to the list before closing', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await leaderboard.seedWorld();
    await page.goto('/leaderboards');

    const dialog = leaderboard.dialog;
    await expect(dialog.locator('.mobile-title')).toHaveText('Leaderboards');
    await expect(dialog.getByRole('navigation')).toHaveCount(0);
    await dialog.getByRole('button', { name: /^Score/ }).first().click();
    await expect(dialog.locator('.mobile-title')).toHaveText('Players · Score');
    await expect(dialog.getByText('Player 2')).toBeVisible();

    await dialog.locator('.back-button').click();
    await expect(dialog.locator('.mobile-title')).toHaveText('Leaderboards');
    await expect(dialog.getByText('Player 2')).toHaveCount(0);

    await dialog.locator('.back-button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

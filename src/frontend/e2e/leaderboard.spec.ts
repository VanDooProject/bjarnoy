import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';

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

const WORLD_ID = 'e2e-world';

interface BoardInfo {
  scope: 'user' | 'settlement' | 'guild';
  category: string;
  available: boolean;
  reason: string | null;
  computedAt: string | null;
  entryCount: number | null;
}

const directoryFixture: { boards: BoardInfo[]; weeklyWindows: [] } = {
  boards: [
    { scope: 'user', category: 'score', available: true, reason: null, computedAt: '2026-08-01T00:00:00Z', entryCount: 3 },
    { scope: 'guild', category: 'score', available: false, reason: 'noGuildSystemYet', computedAt: null, entryCount: null },
  ],
  weeklyWindows: [],
};

function scoreEntry(rank: number) {
  return {
    rank,
    subjectId: `user-${rank}`,
    subjectName: `Player ${rank}`,
    value: 1000 - rank,
    previousRank: rank,
    delta: 0,
  };
}

/**
 * Wires up the leaderboard endpoints this view calls, before the page ever
 * navigates (Playwright routes registered up front apply to the whole
 * session). `scorePages` lets pagination tests hand back a different
 * `nextAfterRank` per page, keyed by the `afterRank` query param the store
 * sends (`undefined` for the first page).
 */
async function mockLeaderboardApi(
  page: Page,
  scorePages: Record<string, { items: ReturnType<typeof scoreEntry>[]; nextAfterRank: number | null }>,
) {
  await page.route(`**/api/v1/worlds/${WORLD_ID}/leaderboards`, (route: Route) =>
    route.fulfill({ json: directoryFixture }),
  );
  // Anchored regex, not a glob: a glob `**/leaderboards/user/score*` would
  // also swallow `.../score/me` (its own, more specific route below), and
  // relying on registration order between the two call sites instead is
  // fragile. `?` here means an actual literal query string, not glob's
  // "one wildcard character".
  await page.route(new RegExp(`/api/v1/worlds/${WORLD_ID}/leaderboards/user/score(\\?.*)?$`), (route: Route) => {
    const url = new URL(route.request().url());
    const afterRank = url.searchParams.get('afterRank') ?? 'first';
    const page_ = scorePages[afterRank] ?? { items: [], nextAfterRank: null };
    return route.fulfill({
      json: {
        scope: 'user',
        category: 'score',
        available: true,
        reason: null,
        isFinal: false,
        periodStart: null,
        periodEnd: null,
        computedAt: '2026-08-01T00:00:00Z',
        items: page_.items,
        nextAfterRank: page_.nextAfterRank,
      },
    });
  });
}

/**
 * Simulates a logged-in session without a real `/auth/login` round trip:
 * seeds a refresh token so `authStore.ensureInitialized()` (awaited by the
 * router guard on every navigation) calls `tryRefresh()`, then intercepts
 * that one `/auth/refresh` call. This is the same shape as `__demoWorld` —
 * a test-only shortcut into a store that a real UI flow would normally
 * drive — except auth has no `DEMO_MODE` hook of its own, so route
 * interception is what stands in for one here.
 */
async function loginAs(page: Page, userName: string) {
  const user = { id: 'user-1', userName, role: 'player', status: 'active', displayName: userName };
  await page.addInitScript((name) => localStorage.setItem('bjarnoy.refreshToken', `seed-refresh-${name}`), userName);
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({ json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user } }),
  );
  // `ensureInitialized()` follows a successful refresh with `fetchMe()` — a
  // real GET to confirm the access token still resolves a user — and
  // `fetchMe()` calls `clearSession()` on ANY failure, silently undoing the
  // refresh above if this isn't mocked too.
  await page.route('**/api/v1/auth/me', (route: Route) => route.fulfill({ json: user }));
}

async function gotoLeaderboards(page: Page) {
  await page.addInitScript((worldId) => localStorage.setItem('bjarnoy.worldId', worldId), WORLD_ID);
  await page.goto('/leaderboards');
  // The directory fetch is async even against a mocked, instant response —
  // wait for the real tabs to render rather than a fixed sleep.
  await page.getByRole('button', { name: 'Score' }).first().waitFor();
}

test.describe('leaderboards', { tag: '@g2' }, () => {
  test('is reachable via the HUD nav link from the world map', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // foundSettlement/gotoWorldMap would also work, but the nav link itself
    // is rendered by HudNav regardless of a founded settlement — landing is
    // the lightest view that mounts it (see HudNav.vue's `v-if` guarding
    // only the Settlement link, not Leaderboards).
    await page.goto('/');
    await page.getByRole('button', { name: 'Leaderboards' }).click();
    await page.waitForURL('**/leaderboards');
    await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
  });

  test('shows the no-live-world hint when no world has been joined', async ({ page }) => {
    await page.goto('/leaderboards');
    await expect(page.getByText('No live world to show leaderboards for.')).toBeVisible();
  });

  test('renders the category/scope tabs from the directory response and switches between a live and a dark board', async ({
    page,
  }) => {
    await mockLeaderboardApi(page, { first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await gotoLeaderboards(page);

    // Two "Score" tabs: one per scope group (Players, Guilds) per
    // categoryLabels/scopeLabels in LeaderboardView.vue.
    const tabs = page.getByRole('button', { name: 'Score' });
    await expect(tabs).toHaveCount(2);

    // The first board in the directory (user/score, live) is auto-selected
    // on mount — a real table with the mocked rows.
    await expect(page.locator('table.table')).toBeVisible();
    await expect(page.locator('table.table tbody tr')).toHaveCount(2);
    await expect(page.getByText('Player 1')).toBeVisible();

    // Switching to the guild/score tab (always noGuildSystemYet today,
    // per LeaderboardCatalogue.cs) shows the dark-board reason instead of a
    // table — it's opted-out of the live-board fetch entirely.
    await tabs.nth(1).click();
    await expect(page.locator('table.table')).toHaveCount(0);
    await expect(page.getByText('Unlocks once guilds exist.')).toBeVisible();
  });

  test('"Load more" appends further rows and disappears once the board is exhausted', async ({ page }) => {
    // Two pages is enough to exercise the append + cursor-exhaustion logic
    // without fabricating a large dataset — LeaderboardView.vue's own
    // `nextAfterRank`/`loadPage` handling doesn't care how many rows are on
    // either side of that boundary, only whether one exists.
    await mockLeaderboardApi(page, {
      first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: 2 },
      '2': { items: [scoreEntry(3)], nextAfterRank: null },
    });
    await gotoLeaderboards(page);

    await expect(page.locator('table.table tbody tr')).toHaveCount(2);
    const loadMore = page.getByRole('button', { name: 'Load more' });
    await expect(loadMore).toBeEnabled();

    await loadMore.click();
    await expect(page.locator('table.table tbody tr')).toHaveCount(3);
    await expect(page.getByText('Player 3')).toBeVisible();

    // No more pages left — the pager button is disabled rather than
    // removed (see LeaderboardView.vue's `:disabled` binding), which also
    // stops it re-reading as "Load more" while a real click would no-op.
    await expect(loadMore).toBeDisabled();
  });

  test('"Jump to my rank" is hidden when logged out', async ({ page }) => {
    await mockLeaderboardApi(page, { first: { items: [scoreEntry(1)], nextAfterRank: null } });
    await gotoLeaderboards(page);

    await expect(page.getByRole('button', { name: 'Jump to my rank' })).toHaveCount(0);
  });

  test('"Jump to my rank" is visible and functional when logged in', async ({ page }) => {
    await mockLeaderboardApi(page, { first: { items: [scoreEntry(1), scoreEntry(2)], nextAfterRank: null } });
    await loginAs(page, 'e2e-player');
    // `jumpToMyRank()` is called with no `subjectId`, so the real request
    // has no query string at all — `*` (matching zero or more chars) covers
    // that, unlike glob's `?` (exactly one char).
    await page.route(`**/api/v1/worlds/${WORLD_ID}/leaderboards/user/score/me*`, (route: Route) =>
      route.fulfill({
        json: { myRank: 7, items: [scoreEntry(6), scoreEntry(7), scoreEntry(8)] },
      }),
    );
    await gotoLeaderboards(page);

    const jumpBtn = page.getByRole('button', { name: 'Jump to my rank' });
    await expect(jumpBtn).toBeVisible();

    await jumpBtn.click();
    // jumpToMyRank() replaces `entries` outright with the /me window, so
    // the table should now show rank 7's neighbourhood, not the original
    // page-1 rows.
    await expect(page.getByText('Player 7')).toBeVisible();
    await expect(page.locator('table.table tbody tr')).toHaveCount(3);
    await expect(page.locator('tr.my-row')).toContainText('Player 7');
  });
});

import type { Locator, Page, Route } from '@playwright/test';

/**
 * Demo mode has no backend behind it, so `world.worldId` is never set and the leaderboard would only ever show its
 * "No live world" hint. The page object seeds `bjarnoy.worldId` (the key `stores/world.ts` reads) and answers the
 * `/api/v1/worlds/:id/leaderboards...` calls with `page.route` instead of standing up a real world; the
 * Aspire-orchestrated job exercises the real backend.
 */

export const LEADERBOARD_WORLD_ID = 'e2e-world';
const WORLD_ID = LEADERBOARD_WORLD_ID;

interface BoardInfo {
  scope: 'user' | 'settlement' | 'guild';
  category: string;
  available: boolean;
  reason: string | null;
  computedAt: string | null;
  entryCount: number | null;
  myRank: number | null;
}

const WEEK_1 = '2026-07-01T00:00:00Z';
const WEEK_2 = '2026-07-08T00:00:00Z';

const directoryFixture: { boards: BoardInfo[]; weeklyWindows: { periodStart: string; periodEnd: string }[] } = {
  boards: [
    { scope: 'user', category: 'score', available: true, reason: null, computedAt: '2026-05-31T23:00:00Z', entryCount: 3, myRank: 2 },
    { scope: 'user', category: 'weeklyScoreGained', available: true, reason: null, computedAt: '2026-05-31T23:00:00Z', entryCount: 3, myRank: null },
    { scope: 'guild', category: 'score', available: false, reason: 'noGuildSystemYet', computedAt: null, entryCount: null, myRank: null },
  ],
  weeklyWindows: [
    { periodStart: WEEK_1, periodEnd: WEEK_2 },
    { periodStart: WEEK_2, periodEnd: '2026-07-15T00:00:00Z' },
  ],
};

export function scoreEntry(rank: number) {
  return {
    rank,
    subjectId: `user-${rank}`,
    subjectName: `Player ${rank}`,
    value: 1000 - rank,
    previousRank: rank,
    delta: 0,
  };
}

/** One page of a board: its rows and the cursor to the next page. */
export type BoardPage = { items: ReturnType<typeof scoreEntry>[]; nextAfterRank: number | null };

/** The leaderboards (`/leaderboards`): a modal over the map with a board rail, on a phone a list that drills into a board. */
export class LeaderboardPage {
  readonly page: Page;
  readonly boardsNav: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.boardsNav = page.getByRole('navigation', { name: 'Boards' });
    this.dialog = page.getByRole('dialog');
  }

  /**
   * Wires up the leaderboard endpoints this view calls, before the page ever navigates (Playwright routes registered
   * up front apply to the whole session). `scorePages` lets pagination tests hand back a different `nextAfterRank`
   * per page, keyed by the `afterRank` query param the store sends (`first` for the first page).
   */
  async mockApi(scorePages: Record<string, BoardPage>): Promise<void> {
    const page = this.page;
    await page.route(`**/api/v1/worlds/${WORLD_ID}/leaderboards`, (route: Route) =>
      route.fulfill({ json: directoryFixture }),
    );
    await page.route(`**/api/v1/worlds/${WORLD_ID}/settlements/mine`, (route: Route) => route.fulfill({ json: [] }));
    // The weekly board: the current board is the newest closed window; naming a window returns that one.
    await page.route(new RegExp(`/api/v1/worlds/${WORLD_ID}/leaderboards/user/weeklyScoreGained(\\?.*)?$`), (route: Route) => {
      const periodStart = new URL(route.request().url()).searchParams.get('periodStart') ?? WEEK_2;
      return route.fulfill({
        json: {
          scope: 'user',
          category: 'weeklyScoreGained',
          available: true,
          reason: null,
          isFinal: true,
          periodStart,
          periodEnd: null,
          computedAt: '2026-05-31T23:00:00Z',
          items: [scoreEntry(1)],
          nextAfterRank: null,
        },
      });
    });
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
          computedAt: '2026-05-31T23:00:00Z',
          items: page_.items,
          nextAfterRank: page_.nextAfterRank,
        },
      });
    });
  }

  /** Seeds the joined world id before the app boots. */
  async seedWorld(): Promise<void> {
    await this.page.addInitScript((worldId) => localStorage.setItem('bjarnoy.worldId', worldId), WORLD_ID);
  }

  /** The "Score" tabs of the rail, one per scope group, without the weekly board. */
  get scoreTabs(): Locator {
    return this.boardsNav.getByRole('button', { name: 'Score' }).filter({ hasNotText: 'Weekly' });
  }

  /** The first "Score" board button, in the desktop rail or in the phone's list of boards. */
  get firstScoreBoard(): Locator {
    return this.dialog.getByRole('button', { name: /^Score/ }).first();
  }

  /** Seeds the world, opens `/leaderboards` and waits for the directory's tabs to render. */
  async goto(): Promise<void> {
    await this.seedWorld();
    await this.page.goto('/leaderboards');
    // The directory fetch is async even against a mocked, instant response: wait for the real tabs to render.
    await this.firstScoreBoard.waitFor();
  }
}

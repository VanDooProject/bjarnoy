import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * "Join another world" (ReturningPlayerMenu → `/worlds`, WorldPickerView.vue).
 *
 * IMPORTANT SCOPE NOTE, read before extending this file — same shape as
 * `settlement-expansion.spec.ts`'s own scope note, for the same underlying
 * reason: this repo's TS e2e harness (`playwright.config.ts`) only ever boots
 * the built SPA via `vite preview` with no backend behind it, so every spec
 * in this directory runs with `DEMO_MODE` true. `WorldPickerView.vue` itself
 * doesn't branch on `DEMO_MODE` at all — its `listJoinableWorlds()` /
 * `getWorldMembership()` calls go out over real HTTP regardless of mode
 * (same as `register.spec.ts`'s `/auth/register` or `admin-world-reseed
 * .spec.ts`'s admin endpoints), which is what makes this spec's *listing*
 * coverage below possible against a mocked API with no real backend.
 *
 * The actual world-*switch*, though — `stores/world.ts`'s `joinWorld()` — is
 * a hard no-op in demo mode:
 *
 *   async joinWorld(worldId: string) {
 *     if (DEMO_MODE) return;
 *     ...
 *   }
 *
 * (there is only ever the one local `WorldModel` demo mode simulates — see
 * that function's own comment). So the actual regression this whole feature
 * exists to fix — join a second world, found there, go back to `/worlds`,
 * return to the original world, and land back in the *original* realm
 * rather than stuck on the new one or stranded — cannot be exercised by
 * clicking through this harness: clicking "Join" here still navigates away
 * (`joinOrReturn`'s `await world.joinWorld(w.id); router.push('/')` runs
 * either way, since a no-op resolves same as a real call), but nothing about
 * which world/settlement is active actually changes underneath it, so a test
 * asserting the founding flow or the restored realm afterward would be
 * asserting demo mode's own pre-existing single-world state, not this
 * feature.
 *
 * Covering that for real needs the same thing `settlement-expansion.spec.ts`
 * flags as still-missing: an e2e harness that boots the real ASP.NET backend
 * (`VITE_DEMO_MODE=false` plus either a live `Bjarnoy.Api` or a much larger
 * mocked surface than the two endpoints below — `bootstrapLiveWorld`,
 * `foundStartingSettlementLive`, and `restoreLiveSettlement` between them
 * touch world/island/plot-suggestion/settlement endpoints this spec never
 * needs). Tracked here instead of silently skipped. Until that harness
 * exists, this spec covers what demo mode's mocked-API harness actually can:
 * the picker's own rendering/reachability logic against known response
 * shapes.
 */

interface JoinableWorldFixture {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  joinable: boolean;
  joinableReason: string;
  startsAt: string | null;
  speedFactor: number;
  createdAt: string;
  status: string;
}

function world(overrides: Partial<JoinableWorldFixture> & { id: string; name: string }): JoinableWorldFixture {
  return {
    playerCount: 10,
    maxPlayers: 500,
    joinable: true,
    joinableReason: 'none',
    startsAt: null,
    speedFactor: 1,
    createdAt: '2026-01-01T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

/**
 * Mocks the two endpoints WorldPickerView's `load()` calls before anything
 * renders: the joinable-worlds list, and one membership check per row other
 * than the current world (`w.id !== world.worldId` — see that component's
 * own comment on why there's no bulk endpoint). `membership` is keyed by
 * world id; a world with no entry gets `settlementId: null` ("no realm known
 * here"), matching `checkMembership`'s own best-effort fallback.
 */
async function mockWorldsApi(
  page: Page,
  worlds: JoinableWorldFixture[],
  membership: Record<string, string | null> = {},
) {
  await page.route('**/api/v1/worlds/joinable', (route: Route) => route.fulfill({ json: worlds }));
  await page.route(/\/api\/v1\/worlds\/([^/]+)\/membership/, (route: Route) => {
    const match = route.request().url().match(/\/worlds\/([^/?]+)\/membership/);
    const worldId = match?.[1] ?? '';
    const settlementId = membership[worldId] ?? null;
    return route.fulfill({
      json: { worldId, settlementId, settlementName: settlementId ? 'Some Realm' : null },
    });
  });
}

/** Seeds the currently-active world before the app boots — same key `stores/world.ts` reads it from. */
async function seedCurrentWorld(page: Page, worldId: string) {
  await page.addInitScript((id) => localStorage.setItem('bjarnoy.worldId', id), worldId);
}

const CURRENT = world({ id: 'world-current', name: 'Midgard' });
const JOINABLE = world({ id: 'world-joinable', name: 'Vinland', playerCount: 3, speedFactor: 1.5 });
const ALREADY_JOINED = world({ id: 'world-already-joined', name: 'Svealand', playerCount: 40 });
const BLOCKED = world({
  id: 'world-blocked',
  name: 'Ginnungagap',
  playerCount: 500,
  joinable: false,
  joinableReason: 'joinsclosed',
});

test.describe('world picker', { tag: '@g2' }, () => {
  test('is reachable from the returning-player menu and marks the current world "You\'re here" alongside a joinable one', async ({
    page,
  }) => {
    await mockWorldsApi(page, [CURRENT, JOINABLE], { [JOINABLE.id]: null });
    await seedCurrentWorld(page, CURRENT.id);

    // Real navigation through the actual entry point (ReturningPlayerMenu on
    // the pre-founding landing header), not a direct `page.goto('/worlds')`
    // — see LandingView.vue's pre-founding TopBar.
    await page.goto('/');
    await page.getByTestId('returning-player-trigger').click();
    await page.getByTestId('returning-player-join-world').click();
    await page.waitForURL('**/worlds');

    await expect(page.getByRole('heading', { name: 'Choose a world' })).toBeVisible();

    const rows = page.getByTestId('world-picker-row');
    await expect(rows).toHaveCount(2);

    const currentRow = rows.filter({ hasText: CURRENT.name });
    await expect(currentRow.getByText("You're here")).toBeVisible();
    await expect(currentRow.getByTestId('world-picker-join')).toHaveCount(0);

    const joinableRow = rows.filter({ hasText: JOINABLE.name });
    const joinButton = joinableRow.getByTestId('world-picker-join');
    await expect(joinButton).toBeVisible();
    await expect(joinButton).toBeEnabled();
    await expect(joinButton).toHaveText('Join');
  });

  test('a world this owner already holds a realm in shows "Return" instead of "Join"', async ({ page }) => {
    await mockWorldsApi(page, [CURRENT, ALREADY_JOINED], { [ALREADY_JOINED.id]: 'settlement-elsewhere' });
    await seedCurrentWorld(page, CURRENT.id);

    await page.goto('/worlds');
    await expect(page.getByTestId('world-picker-row')).toHaveCount(2);

    const row = page.getByTestId('world-picker-row').filter({ hasText: ALREADY_JOINED.name });
    await expect(row.getByText('Your realm')).toBeVisible();
    const returnButton = row.getByTestId('world-picker-join');
    await expect(returnButton).toBeVisible();
    await expect(returnButton).toHaveText('Return');
  });

  test('a joins-closed world is shown disabled with its reason, not a working Join button', async ({ page }) => {
    await mockWorldsApi(page, [CURRENT, BLOCKED], { [BLOCKED.id]: null });
    await seedCurrentWorld(page, CURRENT.id);

    await page.goto('/worlds');
    const row = page.getByTestId('world-picker-row').filter({ hasText: BLOCKED.name });
    await expect(row).toBeVisible();

    // No Join button at all — not merely a disabled one — and the reason is
    // WorldPickerView's own `blockedLabel`, reusing `landing.joinBlocked`'s
    // existing copy for the `joinsclosed` wire value (see that function's
    // own comment on why: `JoinableWorldResponse.joinableReason` mirrors the
    // backend's lower-cased `Reason.ToString()`).
    await expect(row.getByTestId('world-picker-join')).toHaveCount(0);
    await expect(row.getByText('This world is no longer accepting new players.')).toBeVisible();
  });
});

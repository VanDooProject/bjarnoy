import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { bubbleUnderPointerTip, waitForMapReady } from './helpers';
import { SettlementPage } from './pages';

test('landing page is the village view, not a marketing page in front of it', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await page.goto('/');

  // zip 6a: a real plot of terrain is on screen immediately — no world map,
  // no click-through, no separate marketing page.
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /put your longhouse somewhere/i })).toBeVisible();
  await expect(page.getByText('Longhouse & yard')).toBeVisible();

  // Founding, then the 2 guided onboarding buildings, then the completion
  // banner's explicit hand-off, then the full game — all without ever
  // visiting a world map.
  await SettlementPage.found(page);
  await expect(page).toHaveURL(/\/settlement$/);
});

// While the terrain art is still loading there is no plot on screen yet, so
// the "Click this plot" pointer waits for the map instead of pointing at an
// empty canvas behind the loading overlay.
test('landing page holds the guided pointer back until the map has loaded', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  let releaseTerrain!: () => void;
  const terrainHeld = new Promise<void>((resolve) => (releaseTerrain = resolve));
  await page.route(/\/terrain-\d+[^/]*\.webp/, async (route: Route) => {
    await terrainHeld;
    await route.continue();
  });
  await page.goto('/');

  const settlement = new SettlementPage(page);
  await expect(page.getByRole('status').filter({ hasText: 'Loading map' })).toBeVisible();
  await expect(settlement.guidancePointer).toHaveCount(0);

  releaseTerrain();
  // The pointer follows the map's own "loaded" state, so wait for that the
  // way every other landing spec does (openLanding) rather than giving the
  // whole terrain atlas download and decode a bare expect timeout.
  await waitForMapReady(page);
  await expect(settlement.guidancePointer).toBeVisible();
  await expect(settlement.guidancePointer).toContainText('Click this plot');
});

// Design handoff "2a" frame 1/1b: before founding, the animated pointer and
// the checklist are already on screen, aimed at the one thing to do.
test('landing page shows the guided pointer and a step-1 checklist before founding', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);

  await expect(settlement.guidancePointer).toBeVisible();
  await expect(settlement.guidancePointer).toContainText('Click this plot');

  await expect(settlement.checklist).toBeVisible();
  await expect(settlement.checklist).toContainText('Step 1 of 3');
  await expect(page.locator('.tray-item.current')).toContainText('Longhouse & yard');
});

for (const screen of [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, phone: false },
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, phone: true },
]) {
test.describe(`onboarding ring pointer, ${screen.name}`, () => {
test.use(screen.phone ? { viewport: screen.viewport, hasTouch: true, isMobile: true } : { viewport: screen.viewport });
test('onboarding build step uses the map\'s two-lane ring, and the pointer walks the player through it to the guided building', { tag: '@g3' }, async ({ page }) => {
  // The onboarding no longer has a ring of its own: it offers what the map's placement filter offers on the clicked
  // hex (Build -> categories -> buildings) and only highlights the next guided building with the pointer. Nothing is
  // dimmed or explained away; a building that can't stand on the hex is simply not there.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  // Frame 2: the landfall banner and the map pointer, right after founding and before the ring has ever opened.
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('Landfall made.');
  await expect(settlement.guidancePointer).toContainText('Now build here');
  await expect(settlement.checklist).toContainText('Step 2 of 3');

  const target = await settlement.findHex({ terrain: 'grass' });
  await settlement.clickHex(target);

  // The landfall banner is gone the moment the ring opens.
  await expect(settlement.banner).toHaveCount(0);
  await settlement.ring.waitForOpen();

  // Root: just Build (the map's rule), and the pointer on it.
  expect(await settlement.ring.labels()).toEqual(['Build']);
  await expect(settlement.guidancePointer).toContainText('Open Build');
  // The arrow's tip is on the bubble it names, not on a neighbour.
  await expect.poll(() => bubbleUnderPointerTip(page)).toBe('Build');

  // Categories of a grass hex, the same ones the map's ring shows there; the pointer moves to the right one.
  if (screen.phone) {
    await settlement.ring.action('Build').first().tap();
    await settlement.ring.settledLayer();
  } else {
    await settlement.ring.openBuildCategories();
  }
  expect(await settlement.ring.labels()).toEqual(expect.arrayContaining(['Resource', 'Military', 'Logistics', 'Defence', 'Shrines']));
  await expect(settlement.guidancePointer).toContainText('Open Resource');
  await expect.poll(() => bubbleUnderPointerTip(page)).toBe('Resource');

  // Buildings: the herder is there, nothing is dimmed, and the pointer is on the herder.
  if (screen.phone) {
    await settlement.ring.category('Resource').first().tap();
    await settlement.ring.settledLayer();
  } else {
    await settlement.ring.openCategory('Resource');
  }
  const herder = settlement.ring.child('Reindeer Herder').first();
  await expect(herder).toBeVisible();
  await expect(herder).toBeEnabled();
  await expect(settlement.ring.child('Lumberjack')).toHaveCount(0);
  await expect(settlement.guidancePointer).toContainText('Build the Reindeer Herder');
  await expect.poll(() => bubbleUnderPointerTip(page)).toBe('Reindeer Herder');
  await expect(page.getByTestId('ring-note')).toHaveCount(0);

  const before = await settlement.countBuildings();
  if (screen.phone) {
    // The first tap arms the building, the second builds it.
    await herder.tap();
    await herder.tap();
  } else {
    await settlement.ring.click(herder);
  }
  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);
  await expect(page.locator('.tray-item .sub').nth(1)).toHaveText('Placed');

  // Frame 4: one guided building down, the pointer moves on to the other.
  await expect(settlement.checklist).toContainText('Step 3 of 3');
  await expect(settlement.guidancePointer).toContainText('One more');
});
});
}

test('onboarding ring on a forest hex offers the lumberjack, and the map pointer still says where the herder goes', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  await settlement.clickHex(await settlement.findHex({ terrain: 'forest' }));
  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Resource');
  await expect(settlement.ring.child('Lumberjack').first()).toBeVisible();
  await expect(settlement.ring.child('Reindeer Herder')).toHaveCount(0);
  // The herder is next but not offered here: no pointer at a ring bubble, the map pointer says where to go.
  await expect(settlement.guidancePointer).toContainText('Now build here');
});

// Design handoff "2a" frame 5: completion drops the checklist for a banner
// with an explicit hand-off, and nudges the player toward naming their jarl
// via the avatar mark instead of a forced popup.
test('onboarding completion leads with the profile nudge, then the completion banner hands off to /settlement', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  // Places both guided buildings directly against the model — the ring
  // interaction itself (terrain gating, the dim note, the pointer) is
  // covered by the test above; this one is about what happens once they're
  // both actually down.
  await page.evaluate(() => {
    const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void } }).__demoWorld();
    const settlementModel = world.model.getSettlement(world.selectedSettlementId);
    const dirs: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const guidedTypes = ['reindeerherder', 'lumberjack'];
    let placed = 0;
    for (let radius = 1; radius <= 2 && placed < guidedTypes.length; radius++) {
      for (const [dq, dr] of dirs) {
        if (placed >= guidedTypes.length) break;
        const at = { q: settlementModel.q + dq * radius, r: settlementModel.r + dr * radius };
        if (world.model.placeBuilding(world.selectedSettlementId, at, guidedTypes[placed])) placed++;
      }
    }
    world.syncHud();
  });

  await expect(settlement.checklist).toHaveCount(0);

  // The profile-mark nudge, glow included, replaces the old forced nickname
  // modal — anchored to the returning-player trigger (ReturningPlayerMenu.vue),
  // not an avatar circle (retired along with the anonymous avatar itself).
  await expect(settlement.profileNudge).toBeVisible();
  await expect(settlement.profileNudge).toContainText('Three buildings, no jarl.');
  await expect(page.getByTestId('returning-player-trigger')).toHaveClass(/is-nudging/);

  // The nudge is the one call to action while it is up: the completion
  // banner and its "Enter your settlement" wait until it is answered.
  await expect(settlement.banner).toHaveCount(0);

  await page.getByTestId('profile-nudge-later').click();
  await expect(settlement.profileNudge).toHaveCount(0);
  await expect(page.getByTestId('returning-player-trigger')).not.toHaveClass(/is-nudging/);
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('All three placed.');

  await settlement.continueButton.click();
  await page.waitForURL('**/settlement');
});

test('onboarding ring menu closes on an outside click and on Escape', { tag: '@g3' }, async ({ page }) => {
  // Issue #141: the ring used to make its backdrop opt-in per instance, and
  // LandingView never opted in — so its backdrop rendered with
  // `pointer-events: none`, silently disabling the outside-click close (and
  // right-click) that SettlementView's own ring already had, and Escape had
  // never been wired up anywhere the ring menu is used. There is one ring
  // component per open menu now, and it always owns its backdrop, so there is
  // no longer a way to render one without these.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  const target = await settlement.findHex({ notTerrain: 'sea' });

  await settlement.clickHex(target);
  await expect(settlement.ring.bubbles.first()).toBeVisible();

  // Well clear of the ring's own bubbles, elsewhere on the landing page.
  await page.mouse.click(20, 20);
  await expect(settlement.ring.bubbles).toHaveCount(0);

  await settlement.clickHex(target);
  await expect(settlement.ring.bubbles.first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(settlement.ring.bubbles).toHaveCount(0);
});

// landing-page-defects.md L1: a visitor with no settlement used to see the
// full in-game HudNav (WORLD MAP · LEADERBOARDS · REPORTS · ALLIANCE · DOCS ·
// LANDING) plus a locale switcher and an avatar — the mockup
// (docs/design/img/but_building_on_map.png) has only a wordmark and
// "I already have a realm" pre-founding.
//
// Returning-player nav work replaced that bare link with
// ReturningPlayerMenu.vue — so this now drives the trigger/panel instead of
// a single link.
//
// docs/plans/returning-player-world-switching.md's click-count decision:
// the dropdown used to be a 2-row menu (Log in / Join another world) behind
// which the actual world list sat on a separate /worlds page — three clicks
// to switch worlds. It now opens straight to the world list itself
// (WorldList.vue, shared with WorldPickerView.vue's full-page use at
// /worlds) — two clicks — with "Log in" still reachable in the same single
// click that opened the dropdown. Mocked the same way world-picker.spec.ts
// mocks WorldList's own two calls, since they go out over real HTTP
// regardless of DEMO_MODE (see that file's own scope note).
test('the pre-founding header has no dead in-game nav, only the returning-player menu', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);

  await page.route('**/api/v1/worlds/joinable', (route: Route) =>
    route.fulfill({
      json: [
        {
          id: 'world-1',
          name: 'Midgard',
          playerCount: 10,
          maxPlayers: 500,
          joinable: true,
          joinableReason: 'none',
          startsAt: null,
          speedFactor: 1,
          createdAt: '2026-01-01T00:00:00Z',
          status: 'active',
        },
      ],
    }),
  );
  await page.route(/\/api\/v1\/worlds\/([^/]+)\/membership/, (route: Route) =>
    route.fulfill({ json: { worldId: 'world-1', settlementId: null, settlementName: null } }),
  );

  await SettlementPage.openLanding(page);

  await expect(page.getByRole('button', { name: 'World map', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alliance', exact: true })).toHaveCount(0);

  const trigger = page.getByTestId('returning-player-trigger');
  await expect(trigger).toBeVisible();
  await expect(page.getByTestId('returning-player-menu')).toHaveCount(0);

  await trigger.click();
  await expect(page.getByTestId('returning-player-menu')).toBeVisible();

  const login = page.getByTestId('returning-player-login');
  await expect(login).toBeVisible();

  const worldRow = page.getByTestId('world-picker-row');
  await expect(worldRow).toHaveCount(1);
  await expect(worldRow).toContainText('Midgard');
  await expect(worldRow.getByTestId('world-picker-join')).toBeVisible();

  await login.click();
  await expect(page).toHaveURL(/\/login$/);
});

// Returning-player nav work: World map and Leaderboards now additionally
// require `auth.isAuthenticated` (previously World map only needed a founded
// settlement, and Leaderboards had no condition at all — see HudNav.vue), so
// an anonymous founder still doesn't get them; Reports/Alliance stay
// unconditioned, and the returning-player menu doesn't disappear once
// founded — it just moves from being the pre-founding header's only content
// into HudNav's own anonymous-state slot (HudNav.vue's `v-else`).
test('founding a settlement swaps the pre-founding header for the real in-game nav, but world map and leaderboards stay hidden until login', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  // Reports/Alliance live in the returning-player menu, not inline.
  await expect(page.getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'World map', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('returning-player-trigger')).toBeVisible();
  await page.getByTestId('returning-player-trigger').click();
  const menu = page.getByTestId('returning-player-menu');
  await expect(menu.getByRole('menuitem', { name: 'Reports', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Alliance', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Leaderboards', exact: true })).toHaveCount(0);
  // Founded: the landing page is no destination any more.
  await expect(menu.getByRole('menuitem', { name: 'Landing', exact: true })).toHaveCount(0);
});

// Mobile tutorial focus (owner decision): the header-hiding and
// checklist-vs-ring behaviour is phone-only (HUD_COMPACT_QUERY, max-width
// 768px) — desktop keeps both the header and the checklist on screen
// throughout, including while the ring is open, at this suite's default
// 1280x800 desktop viewport.
test('desktop keeps the header and the onboarding checklist visible throughout, including while the ring is open', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  await expect(page.locator('.hud-bar')).toBeVisible();
  await expect(settlement.checklist).toBeVisible();

  const target = await settlement.findHex({ terrain: 'grass' });
  await settlement.clickHex(target);
  await settlement.ring.waitForOpen();

  await expect(page.locator('.hud-bar')).toBeVisible();
  await expect(settlement.checklist).toBeVisible();
});

test('impressum page is reachable and links back', { tag: '@g3' }, async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});

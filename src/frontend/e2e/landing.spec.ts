import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
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

test('onboarding build step offers a ring menu with the tile-appropriate guided building enabled and everything else disabled', { tag: '@g3' }, async ({ page }) => {
  // Regression coverage: the onboarding build step used to pop a
  // BuildingModal with a single "Build here" button hardcoded to a type
  // ('farm') that fails outside grass terrain — "can't actually select the
  // correct building". It now opens the same kind of RingMenu the full
  // settlement view uses, simplified to one flat ring (no build-category
  // drill-down): only the guided type matching the *clicked tile's own
  // terrain* is enabled (Farm needs grass, Lumberjack needs forest) —
  // enabling both regardless of terrain would just reintroduce the same
  // silent-failure bug for whichever one doesn't fit.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  // Frame 2: the landfall banner and a re-targeted pointer, right after
  // founding and before the ring has ever opened.
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('Landfall made.');
  await expect(settlement.guidancePointer).toContainText('Now build here');
  await expect(settlement.checklist).toContainText('Step 2 of 3');

  // A guessed pixel offset only happens to land on a real hex at one
  // particular zoom/camera framing — ask the model for a real empty *grass*
  // hex inside the just-founded realm (deterministically exercising Farm's
  // own terrain requirement), then the renderer's own camera math
  // (__settlementRenderer's hexCenterScreen) for that hex's exact screen
  // position. Same technique settlement-interactions.spec.ts uses for the
  // full settlement view's own ring menu.
  const target = await settlement.findHex({ terrain: 'grass' });

  await settlement.clickHex(target);

  // The landfall banner is gone the moment the ring opens (frame 3 has no
  // such banner — the ring/note/pointer take over telling the story).
  await expect(settlement.banner).toHaveCount(0);

  const farm = settlement.ring.action('Farm');
  const lumberjack = settlement.ring.action('Lumberjack');
  const quarry = settlement.ring.action('Quarry');
  await expect(farm).toBeVisible();
  await expect(lumberjack).toBeVisible();
  await expect(quarry).toBeVisible();
  await expect(farm).toBeEnabled();
  await expect(lumberjack).toBeDisabled();
  await expect(quarry).toBeDisabled();

  // Frame 3: a persistent "why it's dim" note explaining the hex, not the
  // click, plus the pointer aimed at whichever bubble actually fits.
  await expect(settlement.ringNote).toBeVisible();
  await expect(settlement.ringNote).toContainText("Why it's dim");
  await expect(settlement.ringNote).toContainText('Lumberjack needs');
  await expect(settlement.guidancePointer).toContainText('This one fits');

  const before = await settlement.countBuildings();
  await farm.click();
  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);
  await expect(page.locator('.tray-item .sub').nth(1)).toHaveText('Placed');

  // Frame 4: one guided building down, the pointer moves on to the other.
  await expect(settlement.checklist).toContainText('Step 3 of 3');
  await expect(settlement.guidancePointer).toContainText('One more');
});

// Design handoff "2a" frame 5: completion drops the checklist for a banner
// with an explicit hand-off, and nudges the player toward naming their jarl
// via the avatar mark instead of a forced popup.
test('onboarding completion shows the completion banner and profile nudge, and hands off to /settlement', { tag: '@g3' }, async ({ page }) => {
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
    const guidedTypes = ['farm', 'lumberjack'];
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

  await expect(settlement.banner).toBeVisible();
  await expect(settlement.banner).toContainText('All three placed.');
  await expect(settlement.checklist).toHaveCount(0);

  // The profile-mark nudge, avatar glow included, replaces the old forced
  // nickname modal.
  await expect(settlement.profileNudge).toBeVisible();
  await expect(settlement.profileNudge).toContainText('Three buildings, no jarl.');
  await expect(page.locator('.avatar.is-nudging')).toBeVisible();

  await page.getByTestId('profile-nudge-later').click();
  await expect(settlement.profileNudge).toHaveCount(0);
  await expect(page.locator('.avatar.is-nudging')).toHaveCount(0);

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
// ReturningPlayerMenu.vue — a dropdown offering both "log in" and "join
// another world" (PR that added ReturningPlayerMenu.vue/WorldPickerView.vue)
// — so this now drives the trigger/panel instead of a single link.
test('the pre-founding header has no dead in-game nav, only the returning-player menu', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
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
  const joinAnotherWorld = page.getByTestId('returning-player-join-world');
  await expect(login).toBeVisible();
  await expect(joinAnotherWorld).toBeVisible();

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

  await expect(page.getByRole('button', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alliance', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'World map', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Leaderboards', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('returning-player-trigger')).toBeVisible();
});

test('impressum page is reachable and links back', { tag: '@g3' }, async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});

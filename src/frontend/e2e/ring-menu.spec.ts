import { expect, test } from './fixtures';
import { distanceFrom, loginTestUser, rectsOf } from './helpers';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage, type ScreenPoint } from './pages';

/**
 * Issue #16 "ring menu": covers bugs reported after the initial pass —
 * (1) drilling into a category/building level used to leave the
 * previous level's tooltip/DOM in a state that could obscure or fail to
 * show the newly opened bubbles, (2) the map underneath kept reacting to
 * hover/wheel/click while a ring was open, since the renderer's own
 * pointer tracking is window-level and doesn't know a ring's DOM overlay
 * is on top (see HexMapRenderer's `interactionLocked`), (3) the header's
 * "World map" button used to be swallowed by the ring's full-screen
 * backdrop instead of navigating, and (4) clicking elsewhere on the map
 * with a ring open used to close that ring and immediately open a new one
 * at the click point, instead of just closing it.
 *
 * The drill-down test below now asserts the "2a" ring's own rule instead of
 * the concentric one it replaced: at most TWO lanes are ever on screen, so
 * drilling *swaps* the inner lane rather than adding an orbit outside it.
 */
// Tagged per-test rather than once on the describe: three of these tests
// (this one, "hovering a building shows its cost...", and touch build's
// single test below) each individually run within ~15s of their 90s CI
// budget, and bundling all three sequentially into one job compounds any
// runner-load variance instead of diluting it — see
// docs/ci/e2e-sharding.md for the CI run that motivated this split.
test.describe('ring menu drill-down', () => {
  test('clicking into build categories, then a category into its buildings, keeps the menu two lanes deep', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { x: cx, y: cy } = await settlement.canvasCentre();

    // Same "try a spread of offsets" approach settlement-interactions.spec
    // uses for finding a buildable tile — walk offsets until one opens a
    // root ring with an enabled "Build" bubble (an own, empty, non-water
    // tile), then hover it to drill in. Offsets stay tight (<=80px): the
    // level-1 realm's own zoom (zoomForFogMargin) packs its claimed hexes
    // much closer on screen than settlement-interactions.spec's own
    // building-placement offsets assume — those only need *some* tile to
    // register a change, not specifically a non-water own tile, so they
    // reach much further out (often past the claimed area into open sea).
    const offsets: Array<[number, number]> = [
      [0, -50], [-25, -40], [25, -40], [-25, 40], [25, 40], [0, 50],
      [-50, 0], [50, 0], [0, -80], [-40, -60], [40, -60],
    ];

    let drilled = false;
    for (const [dx, dy] of offsets) {
      await page.mouse.click(cx + dx, cy + dy);
      const buildBubble = settlement.ring.action('Build');
      // Wait for the ring to actually appear rather than sleeping a flat
      // 150ms and hoping. On a runner where one frame costs 200ms+, that
      // sleep expires before the ring renders and a perfectly good tile
      // gets discarded as unbuildable — burning an offset, and eventually
      // the test's whole budget (issue #167). This is the same move
      // foundSettlement() already makes with waitForMapReady(): a condition
      // wait, not a longer timeout. A tile that genuinely has no ring still
      // costs only the 2s cap, and only on the offsets that miss.
      await buildBubble.first().waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
      if ((await buildBubble.count()) === 0 || (await buildBubble.getAttribute('disabled')) !== null) {
        await page.mouse.click(20, 20);
        await page.waitForTimeout(80);
        continue;
      }

      // Hovering is only a preview: it must not open the categories. Going
      // deeper takes a click, the same as going back already did.
      await settlement.ring.hover(buildBubble);
      await page.waitForTimeout(250);
      await expect(settlement.ring.backBubble).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(1);
      await buildBubble.click();
      await page.waitForTimeout(250);

      // The inner lane is now the categories plus the reserved ‹ BACK slot —
      // the root actions it replaced are gone, which is the whole point of
      // capping the menu at two lanes.
      await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
      const backBubble = settlement.ring.backBubble;
      await expect(backBubble).toHaveCount(1);

      // Lanes are distinguishable by class rather than by excluding labels:
      // `.back` is the reserved back slot, `.child` the outer lane.
      const categoryBubbles = settlement.ring.categoryBubbles;
      // rectsOf snapshots synchronously, where the per-bubble
      // toBeVisible() this replaces used to auto-wait — so keep one
      // auto-waiting assertion to let the ring finish opening, then read
      // all of them at once. One round trip's worth of waiting instead of
      // N. See rectsOf's own comment for why the N mattered.
      await expect(categoryBubbles.first()).toBeVisible();
      const categoryRects = await rectsOf(categoryBubbles);
      expect(categoryRects.length).toBeGreaterThan(0);
      for (const rect of categoryRects) {
        expect(rect.visible, `category bubble "${rect.text}" should be visible`).toBe(true);
      }
      // The tile's own hover tooltip must stay suppressed throughout —
      // this is the regression from the first correction: it used to
      // render on top of exactly these freshly opened bubbles.
      await expect(settlement.tooltip).toBeHidden();

      const categoryTexts = categoryRects.map((r) => r.text);
      const firstCategoryRect = categoryRects[0];
      const categoryDist = distanceFrom(firstCategoryRect, cx + dx, cy + dy);
      await settlement.ring.hover(categoryBubbles.first());
      await page.waitForTimeout(250);
      await expect(settlement.ring.childBubbles).toHaveCount(0);
      await categoryBubbles.first().click();
      await page.waitForTimeout(250);

      // Drilling into a category fans its buildings out on a second lane
      // *beside* the category, which stays exactly where it was — so the
      // player can see what they came through without the menu growing a
      // third orbit.
      for (const label of categoryTexts) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);
      }
      await expect(backBubble).toHaveCount(1);
      const buildingBubbles = settlement.ring.childBubbles;
      await expect(buildingBubbles.first()).toBeVisible();
      const buildingRects = await rectsOf(buildingBubbles);
      expect(buildingRects.length).toBeGreaterThan(0);
      for (const rect of buildingRects) {
        expect(rect.visible, `building bubble "${rect.text}" should be visible`).toBe(true);
        // The outer lane sits further out than the inner one it fanned from.
        expect(distanceFrom(rect, cx + dx, cy + dy)).toBeGreaterThan(categoryDist);
      }
      await expect(settlement.tooltip).toBeHidden();

      // ‹ BACK goes up exactly one level, back to the categories.
      await backBubble.click();
      await page.waitForTimeout(250);
      for (const label of categoryTexts) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);
      }
      for (const rect of buildingRects) {
        await expect(page.getByRole('button', { name: rect.text, exact: true })).toHaveCount(0);
      }

      drilled = true;
      break;
    }
    expect(drilled, 'no offset found an own, empty, buildable tile to drill into').toBe(true);
  });

  test('hovering a building shows its cost, build time and longhouse gate, and a locked one cannot be placed', { tag: '@g2' }, async ({ page }) => {
    // The detail card is what the redesign added on top of navigation: the
    // player asked to see "resource cost, build time, can I afford it" without
    // committing to anything. It must also be honest about the gate — the
    // Barracks unlocks at longhouse 5 (BuildingCatalogue.cs UnlockLevels), so
    // a longhouse-3 realm cannot place one, and the ring says why rather than
    // letting the click silently do nothing. The Watchtower (longhouse 3) is
    // the unlocked building placed at the end.
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await settlement.setSettlementLevel(3);

    // Ask the model for a real empty, owned, grass hex (grass is what carries
    // the Military category — see BUILD_CATEGORIES) rather than guessing a
    // pixel offset that only lands on one at a particular camera framing.
    const target = await settlement.findHex({ terrain: 'grass' });

    const countBuildings = () => settlement.countBuildings();
    const before = await countBuildings();

    await settlement.clickHex(target);

    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Military');

    // Nothing hovered yet, so nothing is preselected — opening a category must
    // not pop a card for a building the player never pointed at.
    await expect(settlement.ring.card).toHaveCount(0);

    const barracks = settlement.ring.child('Barracks').first();
    await settlement.ring.hover(barracks);

    const card = settlement.ring.card;
    await expect(card).toBeVisible();
    // Cost, time and the gate all come from the building catalogue, so these
    // are the backend's own numbers: 130 wood / 110 stone, 7:00, longhouse 5.
    await expect(card).toContainText('130');
    await expect(card).toContainText('110');
    await expect(card).toContainText('7:00');
    await expect(card).toContainText('REQUIRES LONGHOUSE 5');
    await expect(barracks).toHaveClass(/locked/);
    await expect(barracks.locator('.ring-badge.locked')).toHaveCount(1);
    // The card is purely informational: no BUILD button, locked or not.
    await expect(card.locator('button')).toHaveCount(0);

    await barracks.click({ force: true });
    await page.waitForTimeout(300);
    expect(await countBuildings()).toBe(before);

    // Building is a click on the bubble itself. The card is an informational read-out
    // docked next to the ring, so it must stay click-through — otherwise it
    // swallows clicks aimed at whichever bubble it happens to dock beside.
    const cardBox = (await card.boundingBox())!;
    const underCard = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.className ?? null,
      { x: cardBox.x + cardBox.width / 2, y: cardBox.y + 20 },
    );
    expect(underCard).not.toContain('ring-card');

    const watchtower = settlement.ring.child('Watchtower').first();
    await settlement.ring.hover(watchtower);
    await watchtower.click();
    await expect.poll(countBuildings, { timeout: 5_000 }).toBe(before + 1);
  });

  test('the root Upgrade bubble waits (clock badge, no click) with the missing resources on its card when the settlement cannot afford it', { tag: '@g1' }, async ({ page }) => {
    // Regression: Upgrade used to carry no cost information at all — it
    // looked exactly as clickable as when affordable, and demo mode would
    // bump the level for free regardless. Now it is a "waiting" bubble (a
    // temporary shortage, clock badge) and hovering it shows the next
    // level's card with what is missing.
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    const longhouse = await settlement.centreHex();
    const buildingLevel = () => settlement.longhouseBuildingLevel();

    // Longhouse's next level costs 161 wood / 134 stone / 81 food
    // (BuildingCatalogue.cs's 120/100/60 base * 1.34, rounded up for
    // display) and 0 iron at every level — zeroing every resource is short on exactly the first three.
    await settlement.setResources({ wood: 0, stone: 0, food: 0, iron: 0 });
    await settlement.clickHex(longhouse);

    const upgradeBubble = settlement.ring.action('Upgrade').first();
    await expect(upgradeBubble).toBeVisible();
    await expect(upgradeBubble).toHaveClass(/is-waiting/);
    await expect(upgradeBubble.locator('.ring-badge.waiting')).toHaveCount(1);

    // Hovering shows the card even though the bubble is not clickable.
    await expect(settlement.ring.card).toHaveCount(0);
    await settlement.ring.hover(upgradeBubble);
    const card = settlement.ring.card;
    await expect(card).toBeVisible();
    await expect(card).toContainText('Upgrade to level 2');
    await expect(card).toContainText('161');
    await expect(card).toContainText('NOT ENOUGH RESOURCES');
    // Stock keeps ticking up from zero, so the shortfall shrinks while the test runs.
    await expect(card).toContainText(/Need \d+ Wood · \d+ Stone · \d+ Food/);
    await expect(card.locator('button')).toHaveCount(0);

    const levelBefore = await buildingLevel();
    await upgradeBubble.click({ force: true });
    await page.waitForTimeout(300);
    expect(await buildingLevel(), 'a waiting Upgrade bubble must not upgrade anything').toBe(levelBefore);

    // Grant plenty and reopen: the same bubble is now a plain, enabled one.
    await page.keyboard.press('Escape');
    await settlement.setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await settlement.clickHex(longhouse);

    const upgradeBubble2 = settlement.ring.action('Upgrade').first();
    await expect(upgradeBubble2).toBeVisible();
    await expect(upgradeBubble2).not.toHaveClass(/is-waiting/);
    await expect(upgradeBubble2.locator('.ring-badge')).toHaveCount(0);
    await upgradeBubble2.click();
    await expect.poll(buildingLevel, { timeout: 5_000 }).toBe(levelBefore + 1);
  });

  test('a mousedown outside a ring bubble closes the ring and starts dragging the map', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const box = await settlement.canvasBox();
    const { x: cx, y: cy } = await settlement.canvasCentre();

    // Open a ring on the longhouse — any tile with a ring works for this.
    await page.mouse.click(cx, cy);
    await settlement.ring.waitForOpen();
    const before = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });

    // Mousedown on empty backdrop space, away from any bubble, then drag —
    // this single gesture should both dismiss the ring and pan the camera.
    await page.mouse.move(cx + 260, cy + 260);
    await page.mouse.down();
    await expect(settlement.ring.backdrop).toHaveCount(0);
    await page.mouse.move(cx + 200, cy + 200, { steps: 6 });
    await page.mouse.move(cx + 140, cy + 140, { steps: 6 });
    await page.mouse.up();

    const after = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    expect(Buffer.compare(before, after), 'map did not visibly pan from the same gesture that closed the ring').not.toBe(0);
  });

  test('hovering the map while a ring is open does not show the tile tooltip', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { x: cx, y: cy } = await settlement.canvasCentre();

    await page.mouse.click(cx, cy);
    await settlement.ring.waitForOpen();

    // Move over a hex well clear of the ring's own bubbles, inside the
    // backdrop area — with interaction locked, this must not resurrect the
    // tile hover tooltip the renderer would normally draw here.
    await page.mouse.move(cx + 260, cy - 200, { steps: 6 });
    await page.waitForTimeout(250);
    await expect(settlement.tooltip).toBeHidden();
  });

  test('clicking "World map" in the header while a ring is open navigates instead of the ring intercepting it', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // Returning-player nav work: "World map" now requires
    // `auth.isAuthenticated` (see loginTestUser's own comment), so this
    // regression guard needs a real session before it can even reach the
    // button it's testing.
    await loginTestUser(page);
    const settlement = await SettlementPage.found(page);
    const { x: cx, y: cy } = await settlement.canvasCentre();

    await page.mouse.click(cx, cy);
    await settlement.ring.waitForOpen();

    // The header sits at the very top of the screen — the ring's own
    // full-screen backdrop used to render above it and swallow this click,
    // so pressing "World map" reopened a ring under the header instead of
    // navigating.
    await page.getByRole('button', { name: 'World map', exact: true }).click();

    await page.waitForURL('**/world');
    await expect(settlement.ring.bubbles).toHaveCount(0);
  });

  test('clicking elsewhere on the map with a ring open just closes it, instead of opening a new one there', { tag: '@g3' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { x: cx, y: cy } = await settlement.canvasCentre();

    await page.mouse.click(cx, cy);
    await settlement.ring.waitForOpen();

    // A single stationary click well clear of any bubble, elsewhere on the
    // map — this used to close the current ring and immediately reopen a
    // new one at this exact point (the backdrop's own outside-pointerdown
    // handler starts a synthetic drag to let it double as "start panning",
    // and a stationary release of that drag was indistinguishable from a
    // real click on the map underneath).
    await page.mouse.click(cx - 300, cy - 260);
    await page.waitForTimeout(250);

    await expect(settlement.ring.bubbles).toHaveCount(0);
    // Give the (absent) reopened ring's async/tick-based rendering every
    // chance to show up before declaring it stayed closed.
    await page.waitForTimeout(300);
    await expect(settlement.ring.bubbles).toHaveCount(0);
  });

  // Issue #141: Escape had never been wired up anywhere the ring menu is
  // used — only an outside click/right-click on the backdrop closed it.
  test('pressing Escape closes the ring menu', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const centre = await settlement.canvasCentre();

    await page.mouse.click(centre.x, centre.y);
    await settlement.ring.waitForOpen();

    await page.keyboard.press('Escape');
    await expect(settlement.ring.bubbles).toHaveCount(0);
  });
});

test.describe('ring menu availability', () => {
  /** Opens Build → the first category that has `building`, leaving the pointer off every bubble. */
  async function openCategoryOf(settlement: SettlementPage, category: string) {
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory(category);
  }

  test('with no available stock a building bubble waits (clock badge), explains what is missing and cannot be built', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.setResources({ wood: 0, stone: 0, food: 0, iron: 0 });
    await settlement.clickHex(target);
    await openCategoryOf(settlement, 'Resource');

    const herder = settlement.ring.child('Reindeer Herder').first();
    await expect(herder).toHaveClass(/waiting/);
    await expect(herder).not.toHaveClass(/locked/);
    await expect(herder.locator('.ring-badge.waiting')).toHaveCount(1);

    await settlement.ring.hover(herder);
    const card = settlement.ring.card;
    await expect(card).toContainText('NOT ENOUGH RESOURCES');
    await expect(card).toContainText(/Need \d+ Wood/);
    await expect(card.locator('button')).toHaveCount(0);
    await expect(card.locator('b.short').first()).toBeVisible();

    await herder.click({ force: true });
    await page.waitForTimeout(300);
    expect(await settlement.countBuildings(), 'a waiting bubble must not build').toBe(before);
    await expect(settlement.ring.bubbles.first()).toBeVisible();
  });

  test('with every build slot taken a building bubble waits too, and the card says how many slots are free', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await page.evaluate(() => {
      const world = (window as unknown as {
        __demoWorld: () => { hud: { construction: { slots: number; slotsUsed: number } } };
      }).__demoWorld();
      world.hud.construction.slotsUsed = world.hud.construction.slots;
    });
    await settlement.clickHex(target);
    await openCategoryOf(settlement, 'Resource');

    const herder = settlement.ring.child('Reindeer Herder').first();
    await expect(herder).toHaveClass(/waiting/);
    await expect(herder.locator('.ring-badge.waiting')).toHaveCount(1);

    await settlement.ring.hover(herder);
    const card = settlement.ring.card;
    await expect(card).toContainText('NO FREE BUILD SLOT');
    await expect(card.getByTestId('ring-card-slots')).toHaveText('1 · 0 of 2 free');
    await expect(card.getByTestId('ring-card-status')).toContainText('Needs 1 build slot · 0 of 2 free');

    await herder.click({ force: true });
    await page.waitForTimeout(300);
    expect(await settlement.countBuildings(), 'a full-slots bubble must not build').toBe(before);
  });

  test('a building above the longhouse level shows a lock badge and the requirement, and is not clickable', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.clickHex(target);
    await openCategoryOf(settlement, 'Military');

    // Barracks unlock at longhouse 5; a fresh realm is at 1.
    const barracks = settlement.ring.child('Barracks').first();
    await expect(barracks).toHaveClass(/locked/);
    await expect(barracks.locator('.ring-badge.locked')).toHaveCount(1);
    await expect(barracks.locator('.ring-badge.waiting')).toHaveCount(0);

    await settlement.ring.hover(barracks);
    await expect(settlement.ring.card.getByTestId('ring-card-status')).toContainText('Requires longhouse 5');
    await barracks.click({ force: true });
    await page.waitForTimeout(300);
    expect(await settlement.countBuildings()).toBe(before);
  });

  test('a ready building has no status footer and builds on a click of the bubble', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await settlement.clickHex(target);
    await openCategoryOf(settlement, 'Resource');

    const herder = settlement.ring.child('Reindeer Herder').first();
    await settlement.ring.hover(herder);
    const card = settlement.ring.card;
    await expect(card).toContainText('BUILDABLE HERE');
    await expect(card.getByTestId('ring-card-slots')).toHaveText('1 · 2 of 2 free');
    await expect(card.getByTestId('ring-card-status')).toHaveCount(0);
    await expect(card).not.toContainText(/click to build/i);

    await herder.click();
    await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBe(before + 1);
  });

  test('a rejected build keeps the ring open and shows why', { tag: '@g2' }, async ({ page }) => {
    // A race the UI cannot see in time: the hex gets built on after the ring
    // offered it. The model refuses the placement; the ring must say so
    // rather than swallowing the rejection.
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });

    await settlement.setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await settlement.clickHex(target);
    await openCategoryOf(settlement, 'Resource');
    const herder = settlement.ring.child('Reindeer Herder').first();
    await settlement.ring.hover(herder);

    await page.evaluate((hex) => {
      const world = (window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
      }).__demoWorld();
      world.model.placeBuilding(world.selectedSettlementId, hex, 'farm');
    }, target.hex);
    const before = await settlement.countBuildings();

    await herder.click();
    await expect(page.getByTestId('ring-error')).toHaveText('Could not queue that build.');
    await expect(settlement.ring.bubbles.first()).toBeVisible();
    expect(await settlement.countBuildings()).toBe(before);
  });

  test('hovering Details previews the tile, and Details still opens on click', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const longhouse = await settlement.centreHex();

    await settlement.clickHex(longhouse);
    const details = settlement.ring.action('Details').first();
    await settlement.ring.hover(details);
    const card = settlement.ring.card;
    await expect(card).toBeVisible();
    await expect(card).toContainText('Longhouse');
    await expect(card).toContainText('LEVEL 1');
    await expect(card.locator('button')).toHaveCount(0);

    await details.click();
    await expect(settlement.ring.bubbles).toHaveCount(0);
  });

  test('a disabled root action shows the ban look and its reason in a chip on hover', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const longhouse = await settlement.centreHex();

    await settlement.clickHex(longhouse);
    const raze = settlement.ring.action('Raze').first();
    await expect(raze).toHaveClass(/disabled/);
    await expect(raze.locator('.ring-badge.ban')).toHaveCount(1);
    await expect(page.getByTestId('ring-hint')).toHaveCount(0);
    await settlement.ring.hover(raze);
    await expect(page.getByTestId('ring-hint')).toHaveText("Can't raze the longhouse");
  });
});

// The design handoff's remaining open question: touch has no hover, so
// "hover previews, click commits" needs a touch equivalent or a tablet
// player spends resources on the first tap with no chance to see the cost.
// A real touch context (not a synthetic dispatchEvent) is what actually
// exercises the browser's own pointerdown->click suppression this depends
// on — see RingMenu.vue's onBuildingPointerDown.
test.describe('ring menu touch build', { tag: '@g1' }, () => {
  test.use({ hasTouch: true });

  // Regression: opening the ring with a *real* touch tap (page.touchscreen,
  // not a mouse click a touch-capable context also happens to allow) used to
  // close it again immediately. The tap opens the ring synchronously
  // (onPointerUp -> handleClick), but the browser then dispatches its usual
  // compatibility `click` for that touch afterwards — by then Vue has
  // already mounted the ring's hub button centred exactly on the tap point,
  // so that ghost click hit the hub instead of the canvas and triggered its
  // own click handler (goUp -> close), all within the same gesture that
  // opened it.
  //
  // Same risk applies one level deeper: tapping "Build" (or a category)
  // moves *that* bubble to a new position too (the inner lane swaps to
  // categories, then buildings fan out beside it), so a ghost click from
  // drilling in could just as easily land on whatever the tap's own
  // coordinates now cover and pop back out. This test walks the tap all the
  // way from root -> categories -> a category's buildings, asserting the
  // ring survives every hop instead of only the first one.
  test('a real touch tap opens the ring menu and drills into categories and buildings without closing', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    // Root actions only surface "Build" on an own, empty, non-water tile —
    // the longhouse itself (canvasCentre) offers Upgrade/Train instead, so
    // this needs a real buildable hex the way the drill-down spec finds one.
    const target = await settlement.findHex({ terrain: 'grass' });
    const box = await settlement.canvasBox();
    const tap = (p: ScreenPoint) => page.touchscreen.tap(box.x + p.x, box.y + p.y);

    await tap(target.screen);
    await settlement.ring.waitForOpen();

    // Give the ghost click every chance to land before declaring it safe —
    // it would arrive within the same task/microtask turn as the tap, well
    // inside this window.
    await page.waitForTimeout(300);
    await expect(settlement.ring.bubbles.first()).toBeVisible();

    const buildBubble = settlement.ring.action('Build').first();
    await expect(buildBubble).toBeVisible();
    const buildBox = (await buildBubble.boundingBox())!;
    await page.touchscreen.tap(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2);

    // Drilling into categories swapped the inner lane to a new set of
    // bubbles at the same tap point — the ghost click from *this* tap could
    // just as easily have landed on one of those and popped back out.
    const categoryBubbles = settlement.ring.categoryBubbles;
    await expect(categoryBubbles.first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(categoryBubbles.first()).toBeVisible();
    await expect(settlement.ring.backBubble).toHaveCount(1);

    const categoryBox = (await categoryBubbles.first().boundingBox())!;
    await page.touchscreen.tap(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2);

    // Same again, one level deeper: a category's buildings fan out beside
    // it, so this tap's ghost click has yet another fresh set of bubbles to
    // land on instead of the canvas.
    const buildingBubbles = settlement.ring.childBubbles;
    await expect(buildingBubbles.first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(buildingBubbles.first()).toBeVisible();
  });

  test('a touch tap previews a building, and only the second tap builds it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    const target = await settlement.findHex({ terrain: 'grass' });

    const countBuildings = () => settlement.countBuildings();
    const before = await countBuildings();

    // Opening the ring and drilling into a category is unaffected by this
    // fix — hover/click already drilled without needing a hover-equivalent,
    // since navigating isn't destructive. Only the terminal, cost-spending
    // tap on a leaf building needs the two-tap treatment tested below. The
    // navigation taps use .tap() rather than .click() throughout, since a
    // real touch input (not a mouse click a touch-capable context happens
    // to also allow) is what this test is about.
    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await settlement.ring.action('Build').first().tap();
    await settlement.ring.category('Resource').first().tap();

    // Reindeer Herder: unlocked at longhouse 1 and buildable on grass.
    const farm = settlement.ring.child('Reindeer Herder').first();
    await expect(farm).toBeVisible();

    await farm.tap();
    await expect(settlement.ring.card).toContainText('Reindeer Herder');
    await page.waitForTimeout(300);
    expect(await countBuildings(), 'the first tap must only preview, not build').toBe(before);

    await farm.tap();
    await expect.poll(countBuildings, { timeout: 5_000 }).toBe(before + 1);
  });
});

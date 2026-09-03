import { expect, test } from './fixtures';
import { distanceFrom, foundSettlement, rectsOf } from './helpers';

/**
 * Issue #16 "ring menu": covers bugs reported after the initial pass —
 * (1) drilling into a category/building level via hover used to leave the
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
  test('hovering into build categories, then a category into its buildings, keeps the menu two lanes deep', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

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
      const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' });
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

      const bb = (await buildBubble.boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
      await page.waitForTimeout(250);

      // The inner lane is now the categories plus the reserved ‹ BACK slot —
      // the root actions it replaced are gone, which is the whole point of
      // capping the menu at two lanes.
      await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
      const backBubble = page.locator('.ring-bubble.back');
      await expect(backBubble).toHaveCount(1);

      // Lanes are distinguishable by class rather than by excluding labels:
      // `.back` is the reserved back slot, `.child` the outer lane.
      const categoryBubbles = page.locator('.ring-bubble:not(.back):not(.child)');
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
      await expect(page.locator('.hex-tooltip')).toBeHidden();

      const categoryTexts = categoryRects.map((r) => r.text);
      const firstCategoryRect = categoryRects[0];
      const categoryDist = distanceFrom(firstCategoryRect, cx + dx, cy + dy);
      await page.mouse.move(
        firstCategoryRect.x + firstCategoryRect.width / 2,
        firstCategoryRect.y + firstCategoryRect.height / 2,
        { steps: 6 },
      );
      await page.waitForTimeout(250);

      // Drilling into a category fans its buildings out on a second lane
      // *beside* the category, which stays exactly where it was — so the
      // player can see what they came through without the menu growing a
      // third orbit.
      for (const label of categoryTexts) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);
      }
      await expect(backBubble).toHaveCount(1);
      const buildingBubbles = page.locator('.ring-bubble.child');
      await expect(buildingBubbles.first()).toBeVisible();
      const buildingRects = await rectsOf(buildingBubbles);
      expect(buildingRects.length).toBeGreaterThan(0);
      for (const rect of buildingRects) {
        expect(rect.visible, `building bubble "${rect.text}" should be visible`).toBe(true);
        // The outer lane sits further out than the inner one it fanned from.
        expect(distanceFrom(rect, cx + dx, cy + dy)).toBeGreaterThan(categoryDist);
      }
      await expect(page.locator('.hex-tooltip')).toBeHidden();

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
    // watchtower is RequiredLonghouseLevel 2 (BuildingCatalogue.cs), so a
    // fresh level-1 realm cannot place one, and the ring says why rather than
    // letting the click silently do nothing.
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    // Ask the model for a real empty, owned, grass hex (grass is what carries
    // the Defense category — see BUILD_CATEGORIES) rather than guessing a
    // pixel offset that only lands on one at a particular camera framing.
    const target = await page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(settlement);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'grass' && !tile.buildingType) {
            return win.__settlementRenderer().hexCenterScreen(at);
          }
        }
      }
      throw new Error('no empty buildable grass hex found inside the realm');
    });

    const countBuildings = () =>
      page.evaluate(() => {
        const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
          .__demoWorld();
        return world.model.countBuildings(world.selectedSettlementId) as number;
      });
    const before = await countBuildings();

    await page.mouse.click(box.x + target.x, box.y + target.y);

    const hoverBubble = async (locator: ReturnType<typeof page.locator>) => {
      await expect(locator).toBeVisible();
      const rect = (await locator.boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 6 });
    };

    await hoverBubble(page.locator('.ring-bubble', { hasText: 'Build' }).first());
    await hoverBubble(page.locator('.ring-bubble:not(.back):not(.child)', { hasText: 'Defense' }).first());

    // Nothing hovered yet, so nothing is preselected — opening a category must
    // not pop a card for a building the player never pointed at.
    await expect(page.locator('.ring-card')).toHaveCount(0);

    const watchtower = page.locator('.ring-bubble.child', { hasText: 'Watchtower' }).first();
    await hoverBubble(watchtower);

    const card = page.locator('.ring-card');
    await expect(card).toBeVisible();
    // Cost, time and the gate all come from the building catalogue, so these
    // are the backend's own numbers: 120 wood / 200 stone / 10 iron, 8:00,
    // longhouse 2.
    await expect(card).toContainText('120');
    await expect(card).toContainText('200');
    await expect(card).toContainText('8:00');
    await expect(card).toContainText('REQUIRES LONGHOUSE 2');
    await expect(watchtower).toHaveClass(/locked/);

    await watchtower.click({ force: true });
    await page.waitForTimeout(300);
    expect(await countBuildings()).toBe(before);

    // Building is a click on the bubble itself; the card's button is only a
    // second way to do the same thing. The card is an informational read-out
    // docked next to the ring, so it must stay click-through — otherwise it
    // swallows clicks aimed at whichever bubble it happens to dock beside.
    const cardBox = (await card.boundingBox())!;
    const underCard = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.className ?? null,
      { x: cardBox.x + cardBox.width / 2, y: cardBox.y + 20 },
    );
    expect(underCard).not.toContain('ring-card');

    const magicTower = page.locator('.ring-bubble.child', { hasText: 'Magic Tower' }).first();
    await hoverBubble(magicTower);
    await magicTower.click();
    await expect.poll(countBuildings, { timeout: 5_000 }).toBe(before + 1);
  });

  test('the root Upgrade bubble is disabled with a reason when the settlement cannot afford it', { tag: '@g1' }, async ({ page }) => {
    // Regression: Upgrade used to carry no cost information at all — it
    // looked exactly as clickable as when affordable, and demo mode would
    // bump the level for free regardless. Same disabled+hint convention as
    // Raze/Train/the sea-tile Build action, not a new affordance.
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    const longhouseScreen = await page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      return win.__settlementRenderer().hexCenterScreen({ q: settlement.q, r: settlement.r });
    });
    const buildingLevel = () =>
      page.evaluate(() => {
        const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
          .__demoWorld();
        const s = world.model.getSettlement(world.selectedSettlementId);
        return world.model.getTile(s.q, s.r).buildingLevel as number;
      });
    const setResources = (resources: { wood: number; stone: number; food: number; iron: number }) =>
      page.evaluate((r) => {
        const world = (window as unknown as {
          __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void };
        }).__demoWorld();
        world.model.getSettlement(world.selectedSettlementId).resources = r;
        world.syncHud();
      }, resources);

    // Longhouse's next level costs 320 wood / 240 stone / 160 food
    // (BuildingCatalogue.cs's base * CostFactor(2)) and 0 iron at every
    // level — zeroing every resource is short on exactly the first three.
    await setResources({ wood: 0, stone: 0, food: 0, iron: 0 });
    await page.mouse.click(box.x + longhouseScreen.x, box.y + longhouseScreen.y);

    const upgradeBubble = page.locator('.ring-bubble', { hasText: 'Upgrade' }).first();
    await expect(upgradeBubble).toBeVisible();
    await expect(upgradeBubble).toHaveClass(/disabled/);
    await expect(upgradeBubble).toHaveAttribute('title', 'Not enough wood, stone, food');

    const levelBefore = await buildingLevel();
    await upgradeBubble.click({ force: true });
    await page.waitForTimeout(300);
    expect(await buildingLevel(), 'a disabled Upgrade bubble must not upgrade anything').toBe(levelBefore);

    // Grant plenty and reopen: the same bubble is now a plain, enabled one.
    await page.keyboard.press('Escape');
    await setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await page.mouse.click(box.x + longhouseScreen.x, box.y + longhouseScreen.y);

    const upgradeBubble2 = page.locator('.ring-bubble', { hasText: 'Upgrade' }).first();
    await expect(upgradeBubble2).toBeVisible();
    await expect(upgradeBubble2).not.toHaveClass(/disabled/);
    await upgradeBubble2.click();
    await expect.poll(buildingLevel, { timeout: 5_000 }).toBe(levelBefore + 1);
  });

  test('a mousedown outside a ring bubble closes the ring and starts dragging the map', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Open a ring on the longhouse — any tile with a ring works for this.
    await page.mouse.click(cx, cy);
    await page.waitForSelector('.ring-bubble');
    const before = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });

    // Mousedown on empty backdrop space, away from any bubble, then drag —
    // this single gesture should both dismiss the ring and pan the camera.
    await page.mouse.move(cx + 260, cy + 260);
    await page.mouse.down();
    await expect(page.locator('.ring-backdrop')).toHaveCount(0);
    await page.mouse.move(cx + 200, cy + 200, { steps: 6 });
    await page.mouse.move(cx + 140, cy + 140, { steps: 6 });
    await page.mouse.up();

    const after = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    expect(Buffer.compare(before, after), 'map did not visibly pan from the same gesture that closed the ring').not.toBe(0);
  });

  test('hovering the map while a ring is open does not show the tile tooltip', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await page.waitForSelector('.ring-bubble');

    // Move over a hex well clear of the ring's own bubbles, inside the
    // backdrop area — with interaction locked, this must not resurrect the
    // tile hover tooltip the renderer would normally draw here.
    await page.mouse.move(cx + 260, cy - 200, { steps: 6 });
    await page.waitForTimeout(250);
    await expect(page.locator('.hex-tooltip')).toBeHidden();
  });

  test('clicking "World map" in the header while a ring is open navigates instead of the ring intercepting it', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await page.waitForSelector('.ring-bubble');

    // The header sits at the very top of the screen — the ring's own
    // full-screen backdrop used to render above it and swallow this click,
    // so pressing "World map" reopened a ring under the header instead of
    // navigating.
    await page.getByRole('button', { name: 'World map', exact: true }).click();

    await page.waitForURL('**/world');
    await expect(page.locator('.ring-bubble')).toHaveCount(0);
  });

  test('clicking elsewhere on the map with a ring open just closes it, instead of opening a new one there', { tag: '@g3' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await page.waitForSelector('.ring-bubble');

    // A single stationary click well clear of any bubble, elsewhere on the
    // map — this used to close the current ring and immediately reopen a
    // new one at this exact point (the backdrop's own outside-pointerdown
    // handler starts a synthetic drag to let it double as "start panning",
    // and a stationary release of that drag was indistinguishable from a
    // real click on the map underneath).
    await page.mouse.click(cx - 300, cy - 260);
    await page.waitForTimeout(250);

    await expect(page.locator('.ring-bubble')).toHaveCount(0);
    // Give the (absent) reopened ring's async/tick-based rendering every
    // chance to show up before declaring it stayed closed.
    await page.waitForTimeout(300);
    await expect(page.locator('.ring-bubble')).toHaveCount(0);
  });

  // Issue #141: Escape had never been wired up anywhere the ring menu is
  // used — only an outside click/right-click on the backdrop closed it.
  test('pressing Escape closes the ring menu', { tag: '@g1' }, async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.ring-bubble');

    await page.keyboard.press('Escape');
    await expect(page.locator('.ring-bubble')).toHaveCount(0);
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

  test('a touch tap previews a building, and only the second tap builds it', async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    const target = await page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(settlement);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'grass' && !tile.buildingType) {
            return win.__settlementRenderer().hexCenterScreen(at);
          }
        }
      }
      throw new Error('no empty buildable grass hex found inside the realm');
    });

    const countBuildings = () =>
      page.evaluate(() => {
        const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
          .__demoWorld();
        return world.model.countBuildings(world.selectedSettlementId) as number;
      });
    const before = await countBuildings();

    // Opening the ring and drilling into a category is unaffected by this
    // fix — hover/click already drilled without needing a hover-equivalent,
    // since navigating isn't destructive. Only the terminal, cost-spending
    // tap on a leaf building needs the two-tap treatment tested below. The
    // navigation taps use .tap() rather than .click() throughout, since a
    // real touch input (not a mouse click a touch-capable context happens
    // to also allow) is what this test is about.
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await page.waitForSelector('.ring-bubble');
    await page.locator('.ring-bubble', { hasText: 'Build' }).first().tap();
    await page.locator('.ring-bubble:not(.back):not(.child)', { hasText: 'Defense' }).first().tap();

    const magicTower = page.locator('.ring-bubble.child', { hasText: 'Magic Tower' }).first();
    await expect(magicTower).toBeVisible();

    await magicTower.tap();
    await expect(page.locator('.ring-card')).toContainText('Magic Tower');
    await page.waitForTimeout(300);
    expect(await countBuildings(), 'the first tap must only preview, not build').toBe(before);

    await magicTower.tap();
    await expect.poll(countBuildings, { timeout: 5_000 }).toBe(before + 1);
  });
});

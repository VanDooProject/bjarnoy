import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Issue #16 "ring menu": covers bugs reported after the initial pass —
 * (1) drilling into a category/building ring via hover used to leave the
 * previous ring's tooltip/DOM in a state that could obscure or fail to
 * show the newly opened bubbles (and, per a later correction, hovering
 * "Build" must now open a new *outer, concentric* ring rather than
 * replacing the current one), (2) the map underneath kept reacting to
 * hover/wheel/click while a ring was open, since the renderer's own
 * pointer tracking is window-level and doesn't know a ring's DOM overlay
 * is on top (see HexMapRenderer's `interactionLocked`), (3) the header's
 * "World map" button used to be swallowed by the ring's full-screen
 * backdrop instead of navigating, and (4) clicking elsewhere on the map
 * with a ring open used to close that ring and immediately open a new one
 * at the click point, instead of just closing it.
 */
test.describe('ring menu drill-down', () => {
  test('hovering into build categories, then a category into its buildings, opens concentric outer rings without closing the inner ones', async ({ page }) => {
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
      await page.waitForTimeout(150);
      const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' });
      if ((await buildBubble.count()) === 0 || (await buildBubble.getAttribute('disabled')) !== null) {
        await page.mouse.click(20, 20);
        await page.waitForTimeout(80);
        continue;
      }

      const bb = (await buildBubble.boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
      await page.waitForTimeout(250);

      // The root ring's own bubbles ("Details"/"Build") must still be
      // there — concentric rings move outward, they don't replace the
      // ring they were opened from — and the new category ring's bubbles
      // must be visible too, further out than the root ring's.
      const rootBuild = page.getByRole('button', { name: 'Build', exact: true });
      await expect(rootBuild).toHaveCount(1);
      await expect(rootBuild).toBeVisible();
      const rootBuildBox = (await rootBuild.boundingBox())!;
      const rootBuildDist = Math.hypot(rootBuildBox.x + rootBuildBox.width / 2 - (cx + dx), rootBuildBox.y + rootBuildBox.height / 2 - (cy + dy));

      const categoryBubbles = page.locator('.ring-bubble').filter({ hasNotText: /^Details$|^Build$/ });
      const categoryCount = await categoryBubbles.count();
      expect(categoryCount).toBeGreaterThan(0);
      for (let i = 0; i < categoryCount; i++) {
        const bubble = categoryBubbles.nth(i);
        await expect(bubble).toBeVisible();
        // Every category bubble sits on a wider orbit than the root ring's
        // own "Build" bubble — that's what "concentric ... moving out"
        // means, as opposed to just being present anywhere on screen.
        const bBox = (await bubble.boundingBox())!;
        const dist = Math.hypot(bBox.x + bBox.width / 2 - (cx + dx), bBox.y + bBox.height / 2 - (cy + dy));
        expect(dist).toBeGreaterThan(rootBuildDist);
      }
      // The tile's own hover tooltip must stay suppressed throughout —
      // this is the regression from the first correction: it used to
      // render on top of exactly these freshly opened bubbles.
      await expect(page.locator('.hex-tooltip')).toBeHidden();

      const categoryTexts = await categoryBubbles.allTextContents();
      const firstCategory = categoryBubbles.first();
      const fb = (await firstCategory.boundingBox())!;
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2, { steps: 6 });
      await page.waitForTimeout(250);

      // Drilling one level deeper (into a category's building list) must
      // not lose either previous ring — the root ring's "Build" and the
      // category ring's own bubbles both stay put, with the buildings ring
      // opening as a third, even wider orbit.
      await expect(rootBuild).toHaveCount(1);
      for (const label of categoryTexts) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);
      }
      const buildingBubbles = page.locator('.ring-bubble').filter({ hasNotText: /^Details$|^Build$/ }).filter({ hasNotText: new RegExp(`^(${categoryTexts.join('|')})$`) });
      const buildingCount = await buildingBubbles.count();
      expect(buildingCount).toBeGreaterThan(0);
      const categoryBox = (await firstCategory.boundingBox())!;
      const categoryDist = Math.hypot(categoryBox.x + categoryBox.width / 2 - (cx + dx), categoryBox.y + categoryBox.height / 2 - (cy + dy));
      for (let i = 0; i < buildingCount; i++) {
        const bubble = buildingBubbles.nth(i);
        await expect(bubble).toBeVisible();
        const bBox = (await bubble.boundingBox())!;
        const dist = Math.hypot(bBox.x + bBox.width / 2 - (cx + dx), bBox.y + bBox.height / 2 - (cy + dy));
        expect(dist).toBeGreaterThan(categoryDist);
      }
      await expect(page.locator('.hex-tooltip')).toBeHidden();

      drilled = true;
      break;
    }
    expect(drilled, 'no offset found an own, empty, buildable tile to drill into').toBe(true);
  });

  test('a mousedown outside a ring bubble closes the ring and starts dragging the map', async ({ page }) => {
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

  test('hovering the map while a ring is open does not show the tile tooltip', async ({ page }) => {
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

  test('clicking "World map" in the header while a ring is open navigates instead of the ring intercepting it', async ({ page }) => {
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

  test('clicking elsewhere on the map with a ring open just closes it, instead of opening a new one there', async ({ page }) => {
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
  test('pressing Escape closes the ring menu', async ({ page }) => {
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

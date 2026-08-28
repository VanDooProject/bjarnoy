import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Issue #16 "ring menu": covers two bugs reported after the initial pass —
 * (1) drilling into a category/building ring via hover used to leave the
 * previous ring's tooltip/DOM in a state that could obscure or fail to
 * show the newly opened bubbles, and (2) the map underneath kept reacting
 * to hover/wheel/click while a ring was open, since the renderer's own
 * pointer tracking is window-level and doesn't know a ring's DOM overlay
 * is on top (see HexMapRenderer's `interactionLocked`).
 */
test.describe('ring menu drill-down', () => {
  test('hovering into build categories, then a category into its buildings, keeps every ring bubble visible', async ({ page }) => {
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

      // The root ring's bubbles ("Details"/"Build") must be gone — replaced
      // by the category ring — and whatever category bubbles exist must
      // actually be visible, not just present in a hidden/off-screen state.
      await expect(page.getByRole('button', { name: 'Build', exact: true })).toHaveCount(0);
      const categoryBubbles = page.locator('.ring-bubble');
      const categoryCount = await categoryBubbles.count();
      expect(categoryCount).toBeGreaterThan(0);
      for (let i = 0; i < categoryCount; i++) {
        await expect(categoryBubbles.nth(i)).toBeVisible();
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
      // not lose the ring either, and the category bubbles must be gone —
      // replaced by the buildings ring, not left stacked underneath it.
      for (const label of categoryTexts) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
      }
      const buildingBubbles = page.locator('.ring-bubble');
      const buildingCount = await buildingBubbles.count();
      expect(buildingCount).toBeGreaterThan(0);
      for (let i = 0; i < buildingCount; i++) {
        await expect(buildingBubbles.nth(i)).toBeVisible();
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
});

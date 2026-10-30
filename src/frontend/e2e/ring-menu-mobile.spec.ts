import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

// DOM and game state only: water pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false } });

/**
 * The ring's phone layout: touch has no hover, so building is two taps — the
 * first arms a bubble and fills the docked card (a bottom strip in portrait,
 * a side panel away from the hex in landscape), the second commits. The rule
 * has to be visible: the armed bubble carries a ring and a "2" badge, and the
 * dock says "Tap … again to build". A blocked bubble can be armed to read why,
 * but never commits.
 */
const LAYOUTS = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, docks: ['bottom'] },
  { name: 'landscape', viewport: { width: 844, height: 390 }, docks: ['left', 'right'] },
] as const;

const RICH = { wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 };
const POOR = { wood: 0, stone: 0, food: 0, iron: 0 };

for (const layout of LAYOUTS) {
  test.describe(`ring menu on a phone, ${layout.name}`, { tag: '@g3' }, () => {
    test.use({ viewport: layout.viewport, hasTouch: true, isMobile: true });

    async function openResource(settlement: SettlementPage) {
      const target = await settlement.findHex({ terrain: 'grass' });
      await settlement.clickHex(target);
      await settlement.ring.waitForOpen();
      await settlement.ring.action('Build').first().tap();
      await settlement.ring.category('Resource').first().tap();
      const herder = settlement.ring.child('Reindeer Herder').first();
      await expect(herder).toBeVisible();
      return herder;
    }

    test('the first tap arms a building and docks its card with a tap-again hint; the second tap builds', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const settlement = await SettlementPage.found(page);
      await settlement.setResources(RICH);
      const before = await settlement.countBuildings();
      const herder = await openResource(settlement);

      await herder.tap();
      await expect(herder).toHaveClass(/armed/);
      await expect(herder.getByTestId('ring-arm-badge')).toHaveCount(1);
      const card = settlement.ring.card;
      await expect(card).toBeVisible();
      expect(layout.docks as readonly string[]).toContain(await card.getAttribute('data-dock'));
      await expect(card.getByTestId('ring-tap-hint')).toHaveText('Tap Reindeer Herder again to build');
      await expect(card.locator('button')).toHaveCount(0);

      // Docked to an edge, not floating: a full-width strip in portrait, a
      // full-height panel in landscape.
      const box = (await card.boundingBox())!;
      if (layout.name === 'portrait') {
        expect(box.width).toBeGreaterThan(layout.viewport.width - 40);
        expect(box.y + box.height).toBeGreaterThan(layout.viewport.height - 120);
      } else {
        expect(box.height).toBeGreaterThan(layout.viewport.height / 2);
        expect(box.x < 120 || box.x + box.width > layout.viewport.width - 20).toBe(true);
      }

      await page.waitForTimeout(300);
      expect(await settlement.countBuildings(), 'the first tap must only arm, not build').toBe(before);

      await herder.tap();
      await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBe(before + 1);
    });

    test('a blocked building can be armed to read why, but a second tap never builds it', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const settlement = await SettlementPage.found(page);
      await settlement.setResources(POOR);
      const before = await settlement.countBuildings();
      const herder = await openResource(settlement);

      // force: the bubble is aria-disabled, which Playwright's actionability
      // check treats as "not enabled" — a real finger taps it regardless.
      await herder.tap({ force: true });
      await expect(herder).toHaveClass(/armed/);
      // No "2" badge: a second tap would do nothing.
      await expect(herder.getByTestId('ring-arm-badge')).toHaveCount(0);
      const card = settlement.ring.card;
      await expect(card.getByTestId('ring-card-status')).toContainText(/Need \d+ Wood/);
      await expect(card.getByTestId('ring-tap-hint')).toHaveCount(0);

      await herder.tap({ force: true });
      await page.waitForTimeout(400);
      expect(await settlement.countBuildings(), 'a blocked bubble must never build').toBe(before);
      await expect(settlement.ring.bubbles.first()).toBeVisible();
    });

    test('Upgrade arms on the first tap and upgrades on the second', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const settlement = await SettlementPage.found(page);
      await settlement.setResources(RICH);
      const levelBefore = await settlement.longhouseBuildingLevel();

      await settlement.clickHex(await settlement.centreHex());
      const upgrade = settlement.ring.action('Upgrade').first();
      await upgrade.tap();
      await expect(upgrade).toHaveClass(/armed/);
      const card = settlement.ring.card;
      await expect(card).toContainText('Upgrade to level 2');
      await expect(card.getByTestId('ring-tap-hint')).toHaveText('Tap Upgrade again to upgrade');
      await page.waitForTimeout(300);
      expect(await settlement.longhouseBuildingLevel()).toBe(levelBefore);

      await upgrade.tap();
      await expect.poll(() => settlement.longhouseBuildingLevel(), { timeout: 5_000 }).toBe(levelBefore + 1);
    });
  });
}

// Two phone bugs in the same ring. Reported on a 412x915 Android phone: drilled into Build on a hex low on the
// screen, the six categories and ‹ BACK opened as one straight row wider than the screen, the last one clipped.
// And the touch drill-downs above flaked: a tap on a category that had only just appeared (its layer still
// fading in) was dropped, so the category never opened.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test.describe(`ring menu on a ${viewport.width}x${viewport.height} phone`, { tag: '@g3' }, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the build categories open around the hex inside the screen, not as one line across it', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const settlement = await SettlementPage.found(page);
      // Low on the screen, just above the docked card strip: where the categories used to line up. The realm
      // starts centred, so drag the map up the way a player would to bring one of its hexes down there.
      const spot = { x: viewport.width / 2, y: viewport.height - 274 };
      const first = await settlement.findHex({ terrain: 'grass', nearest: spot });
      const box = await settlement.canvasBox();
      const from = { x: box.x + viewport.width / 2, y: box.y + 200 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + (spot.x - first.screen.x), from.y + (spot.y - first.screen.y), { steps: 8 });
      await page.mouse.up();
      const target = await settlement.findHex({ terrain: 'grass', nearest: spot });
      await settlement.clickHex(target);
      await settlement.ring.waitForOpen();
      await settlement.ring.action('Build').first().tap();
      await expect(settlement.ring.backBubble).toBeVisible();
      await expect(settlement.ring.backdrop).not.toHaveAttribute('data-swapping');

      const boxes = await page
        .locator('.ring-bubble:not(.child)')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
      expect(boxes.length).toBeGreaterThanOrEqual(4);
      const centres = boxes.map((b) => ({ x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) }));
      expect(new Set(centres.map((c) => c.y)).size, `not one row: ${JSON.stringify(centres)}`).toBeGreaterThan(1);
      expect(new Set(centres.map((c) => c.x)).size, `not one column: ${JSON.stringify(centres)}`).toBeGreaterThan(1);
      for (const b of boxes) {
        expect(b.x, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
        expect(b.y, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, JSON.stringify(b)).toBeLessThanOrEqual(viewport.width);
        expect(b.y + b.h, JSON.stringify(b)).toBeLessThanOrEqual(viewport.height);
      }
    });
  });
}

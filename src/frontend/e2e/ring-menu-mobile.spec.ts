import type { Page } from '@playwright/test';
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
      await settlement.ring.settledLayer();
      await settlement.ring.category('Resource').first().tap();
      await settlement.ring.settledLayer();
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

// Reported on a 412x915 Android phone: drilled into Build on a hex low on the screen, the six categories and
// ‹ BACK opened as one straight row wider than the screen, the last one clipped. The ring is a circle round its
// hex, always: where none fits, the map slides the hex to where one does first. The map's ring and the onboarding
// page's are the same ring and open the same way, so both are held to it on every phone size.
type Viewport = { width: number; height: number };

/** Drags the map the way a player would, so a grass hex of the realm is drawn near `spot`, and returns that hex. */
async function bringGrassHexTo(page: Page, settlement: SettlementPage, viewport: Viewport, spot: { x: number; y: number }) {
  const first = await settlement.findHex({ terrain: 'grass', nearest: spot });
  const box = await settlement.canvasBox();
  const from = { x: box.x + viewport.width / 2, y: box.y + 200 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (spot.x - first.screen.x), from.y + (spot.y - first.screen.y), { steps: 8 });
  await page.mouse.up();
  return settlement.findHex({ terrain: 'grass', nearest: spot });
}

/** With the ring open on `target`: Build's categories (and ‹ BACK) sit on a circle round the hub, inside the screen. */
async function expectCategoriesOnCircle(
  page: Page,
  settlement: SettlementPage,
  target: Awaited<ReturnType<SettlementPage['findHex']>>,
  viewport: Viewport,
  slides: boolean,
) {
  await settlement.ring.action('Build').first().tap();
  await expect(settlement.ring.backBubble).toBeVisible();
  await expect(settlement.ring.backdrop).not.toHaveAttribute('data-swapping');

  // One round trip: the hub, the inner lane's bubbles, and where the tapped hex is drawn now (the map may
  // have slid it to where a circle fits).
  const { hub, boxes, hex } = await page.evaluate((at) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const renderer = (
      window as unknown as { __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } } }
    ).__settlementRenderer();
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const centre = renderer.hexCenterScreen(at);
    return {
      hub: rect(document.querySelector('.ring-hub')!),
      boxes: [...document.querySelectorAll('.ring-bubble:not(.child)')].map(rect),
      hex: { x: canvas.x + centre.x, y: canvas.y + centre.y },
    };
  }, target.hex);
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  const hubCentre = { x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 };
  // The hub sits on its hex, wherever the map put it.
  expect(Math.hypot(hubCentre.x - hex.x, hubCentre.y - hex.y), JSON.stringify({ hubCentre, hex })).toBeLessThan(3);
  if (slides) expect(hubCentre.y, `slid up from ${target.screen.y}`).toBeLessThan(target.screen.y - 24);
  // Every category (and ‹ BACK) the same distance from the hub: a circle, not a row.
  const radii = boxes.map((b) => Math.hypot(b.x + b.w / 2 - hubCentre.x, b.y + b.h / 2 - hubCentre.y));
  expect(Math.max(...radii) - Math.min(...radii), `radii ${radii.map(Math.round).join(', ')}`).toBeLessThan(1.5);
  for (const b of boxes) {
    expect(b.x, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
    expect(b.y, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, JSON.stringify(b)).toBeLessThanOrEqual(viewport.width);
    expect(b.y + b.h, JSON.stringify(b)).toBeLessThanOrEqual(viewport.height);
  }
}

// Just above the docked card strip, where the categories used to line up; and under the strip, where no circle
// fits at all, so the map slides the hex up first.
const LOW_HEXES = [
  { where: 'just above the docked card', fromBottom: 274, slides: false },
  { where: 'under the docked card, sliding the map up', fromBottom: 170, slides: true },
];

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test.describe(`ring menu on a ${viewport.width}x${viewport.height} phone`, { tag: '@g3' }, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    for (const low of LOW_HEXES) {
      test(`the build categories open on a circle round a hex ${low.where}, inside the screen`, async ({ page }) => {
        test.setTimeout(MAP_SPEC_TIMEOUT_MS);
        const settlement = await SettlementPage.found(page);
        const spot = { x: viewport.width / 2, y: viewport.height - low.fromBottom };
        const target = await bringGrassHexTo(page, settlement, viewport, spot);
        await settlement.clickHex(target);
        await settlement.ring.waitForOpen();
        await expectCategoriesOnCircle(page, settlement, target, viewport, low.slides);
      });

      test(`the onboarding page's build categories open on a circle round a hex ${low.where}, inside the screen`, async ({ page }) => {
        test.setTimeout(MAP_SPEC_TIMEOUT_MS);
        const settlement = await SettlementPage.openLanding(page);
        await settlement.claimLandfall();
        const spot = { x: viewport.width / 2, y: viewport.height - low.fromBottom };
        const target = await bringGrassHexTo(page, settlement, viewport, spot);
        await settlement.clickHex(target);
        await settlement.ring.waitForOpen();
        await expectCategoriesOnCircle(page, settlement, target, viewport, low.slides);
      });
    }
  });
}

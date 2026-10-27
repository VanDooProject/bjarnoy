import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * The ring menu's motion (RingMenu.vue, lib/map/ringMotion.ts), played for real.
 *
 * playwright.config.ts emulates `prefers-reduced-motion: reduce` for the whole
 * suite, which is what keeps every other spec instant. This one opts back in
 * so the choreography actually runs: bloom on open, layer swaps through the
 * hub, the shake on a blocked building, the retract on close, the drop on a
 * build. It checks the end states the animations must settle into (the ring is
 * where the layout says, with no transform left behind to block the hover
 * lift) and that the animations ran, by observing `Element.animate` calls
 * from the outside — nothing in the app branches on being under test.
 */
// `contextOptions` (not the `reducedMotion` option): the config's own contextOptions.reducedMotion takes priority over it.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

interface AnimateLog {
  cls: string;
  keys: string[];
  firstFrame: string;
}

/** Records every Web Animation the page starts (class, keyframe properties, first frame). */
async function watchAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: AnimateLog[] = [];
    (window as unknown as { __animLog: AnimateLog[] }).__animLog = log;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const list = Array.isArray(frames) ? frames : [];
      log.push({
        cls: `${this.className}`,
        keys: [...new Set(list.flatMap((f) => Object.keys(f)))],
        firstFrame: JSON.stringify(list[0] ?? {}),
      });
      return original.call(this, frames, options);
    };
  });
}
const animLog = (page: Page) => page.evaluate(() => (window as unknown as { __animLog: AnimateLog[] }).__animLog);

/** Every ring animation has finished: nothing is mid-flight any more. */
async function ringSettled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.('.ring-backdrop') && a.effect?.getComputedTiming().iterations !== Infinity && a.playState === 'running')
              .length,
        ),
      { timeout: 5_000 },
    )
    .toBe(0);
}

/** The settled layout: each bubble sits at its left/top with full opacity and no leftover transform. */
async function expectBubblesAtRest(page: Page, selector: string): Promise<void> {
  // Park the pointer off the ring: a hovered bubble is legitimately lifted (scale 1.07).
  await page.mouse.move(4, 790);
  await page.waitForTimeout(250);
  const bubbles = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const host = el.parentElement!.getBoundingClientRect();
      return {
        opacity: style.opacity,
        transform: style.transform,
        centreX: rect.x + rect.width / 2 - host.x,
        centreY: rect.y + rect.height / 2 - host.y,
        left: parseFloat((el as HTMLElement).style.left),
        top: parseFloat((el as HTMLElement).style.top),
      };
    }),
  );
  expect(bubbles.length).toBeGreaterThan(0);
  for (const b of bubbles) {
    expect(b.opacity).toBe('1');
    expect(b.transform, 'an entrance left a transform behind: it would block the hover lift').toBe('none');
    expect(Math.abs(b.centreX - b.left)).toBeLessThan(1.5);
    expect(Math.abs(b.centreY - b.top)).toBeLessThan(1.5);
  }
}

test.describe('ring menu motion', () => {
  test('opening the ring and a category settle into the final layout', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await watchAnimations(page);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });

    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await ringSettled(page);
    await expectBubblesAtRest(page, '.ring-hub, .ring-bubble');
    // O1: the hub grew and the bubbles bloomed out of it.
    const opened = await animLog(page);
    expect(opened.some((a) => a.cls.includes('ring-hub') && a.firstFrame.includes('scale(.3)'))).toBe(true);
    expect(opened.filter((a) => a.cls.includes('ring-bubble') && a.firstFrame.includes('scale(.3)')).length).toBeGreaterThanOrEqual(2);

    // Build swaps the root bubbles for the categories (pulled into the hub, then bloomed out of it).
    await settlement.ring.openBuildCategories();
    await expect(settlement.ring.backBubble).toHaveCount(1);
    await ringSettled(page);
    await expect(settlement.ring.categoryBubbles.first()).toBeVisible();
    await expect(page.locator('.ring-hub')).toContainText('BUILD');
    await expectBubblesAtRest(page, '.ring-hub, .ring-bubble');

    // A category fans its buildings out beside it, linked to it.
    await settlement.ring.openCategory('Resource');
    await expect(settlement.ring.childBubbles.first()).toBeVisible();
    await ringSettled(page);
    await expectBubblesAtRest(page, '.ring-hub, .ring-bubble');
    expect(await page.locator('.ring-link').count()).toBe(await settlement.ring.childBubbles.count());
    const fan = await animLog(page);
    expect(fan.some((a) => a.cls.includes('ring-link') && a.firstFrame.includes('scaleX(0)'))).toBe(true);

    // ‹ BACK reverses it, one layer at a time.
    await settlement.ring.click(settlement.ring.backBubble);
    await expect(settlement.ring.childBubbles).toHaveCount(0);
    await ringSettled(page);
    await expect(settlement.ring.backBubble).toHaveCount(1);
    await settlement.ring.click(settlement.ring.backBubble);
    await expect(settlement.ring.backBubble).toHaveCount(0);
    await ringSettled(page);
    await expect(settlement.ring.action('Build').first()).toBeVisible();
  });

  test('a blocked building shakes and does not build', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await watchAnimations(page);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.clickHex(target);
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Military');
    // Barracks unlock at longhouse 5; a fresh realm is at 1.
    const barracks = settlement.ring.child('Barracks').first();
    await settlement.ring.hover(barracks);
    await expect(settlement.ring.card.getByTestId('ring-card-status')).toContainText('Requires longhouse 5');
    await ringSettled(page);

    await barracks.click({ force: true });
    // X1: the shake uses the `translate` property, and the reason line flashes.
    await expect.poll(async () => (await animLog(page)).some((a) => a.cls.includes('ring-bubble') && a.keys.includes('translate'))).toBe(true);
    expect((await animLog(page)).some((a) => a.cls.includes('card-status') && a.firstFrame.includes('rgba(240,166,74,.35)'))).toBe(true);
    await ringSettled(page);
    expect(await settlement.countBuildings()).toBe(before);
    await expect(settlement.ring.card).toBeVisible();
    // The shake leaves nothing behind either.
    await expect(barracks).toHaveCSS('translate', 'none');
  });

  test('closing with Escape retracts the ring, and only then removes it', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await watchAnimations(page);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });

    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await ringSettled(page);

    await page.keyboard.press('Escape');
    // X3: every bubble is pulled into the hub, then the hub scales down and fades…
    await expect.poll(async () => (await animLog(page)).some((a) => a.cls.includes('ring-hub') && a.firstFrame.includes('"opacity":1') && a.firstFrame.includes('transform'))).toBe(true);
    // …and only after that does the ring leave the DOM.
    await expect(settlement.ring.backdrop).toHaveCount(0, { timeout: 5_000 });
    await expect(settlement.ring.bubbles).toHaveCount(0);

    // The map is usable again: a new click opens a fresh ring.
    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
  });

  test('a click outside closes the ring and still starts a map drag at once', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await ringSettled(page);

    const zoomBefore = await page.evaluate(() =>
      (window as unknown as { __settlementRenderer: () => { cameraZoom: number } }).__settlementRenderer().cameraZoom,
    );
    const shot = await settlement.screenshot();
    await page.mouse.move(120, 700);
    await page.mouse.down();
    await page.mouse.move(260, 640, { steps: 8 });
    await page.mouse.up();
    await expect(settlement.ring.backdrop).toHaveCount(0, { timeout: 5_000 });
    // The drag moved the map right away (the ring did not swallow the gesture while it retracted).
    expect(Buffer.compare(shot, await settlement.screenshot())).not.toBe(0);
    expect(zoomBefore).toBeGreaterThan(0);
  });

  test('in demo mode a build drops onto the hex, the ring closes', { tag: '@g2' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await watchAnimations(page);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const before = await settlement.countBuildings();

    await settlement.setResources({ wood: 99_999, stone: 99_999, food: 99_999, iron: 99_999 });
    await settlement.clickHex(target);
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Resource');
    const herder = settlement.ring.child('Reindeer Herder').first();
    await settlement.ring.hover(herder);
    await expect(settlement.ring.card).toContainText('BUILDABLE HERE');
    // H4: the buildable bubble glows while its card is up.
    await expect(herder).toHaveClass(/glow/);
    await ringSettled(page);

    await herder.click();
    await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBe(before + 1);
    // X2: the bubble dropped onto the hex (scale .35) while the rest retracted…
    const log = await animLog(page);
    expect(log.some((a) => a.cls.includes('ring-bubble') && a.firstFrame.includes('"opacity":1') && a.keys.includes('transform'))).toBe(true);
    // …then the ring closed.
    await expect(settlement.ring.backdrop).toHaveCount(0, { timeout: 5_000 });
    // X8 does not apply here: demo placement is free (WorldModel.placeBuilding takes nothing from the stock), so no
    // pill counts down — the tick-down is unit-tested (ResourceBar.spend.test.ts) and live-only in practice.
  });
});

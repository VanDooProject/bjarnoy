import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { fingerDown, fingerUp } from './helpers';
import { SettlementPage } from './pages';

/**
 * Quick upgrade (premium): Shift+click on a building orders its next level with no ring (desktop); holding the ring's Upgrade
 * bubble turns on a mode where a tap on an own building upgrades it, and a long press on the map turns it off (phone). A free
 * account gets neither: Shift+click opens the ring. Decision logic is unit-tested (MapView.quickUpgrade.test.ts); this is the
 * wiring through the real renderer, pointer and touch handling.
 */
// DOM and game state only: water and fog pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false, fog: false } });

const RICH = 99_999;

async function foundAs(page: Parameters<typeof SettlementPage.found>[0], adminAuth: { loginAsPlayer: (name: string, opts?: { isPremium?: boolean }) => Promise<void> }, premium: boolean) {
  await adminAuth.loginAsPlayer(premium ? 'quick-premium' : 'quick-free', { isPremium: premium });
  const settlement = await SettlementPage.found(page);
  await settlement.fund(RICH);
  return settlement;
}

test.describe('quick upgrade with Shift on desktop', { tag: '@g2' }, () => {
  test('Shift+click on the longhouse upgrades it at once and opens no ring', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, true);
    const centre = await settlement.centreHex();
    const before = await settlement.longhouseBuildingLevel();

    await page.keyboard.down('Shift');
    await settlement.clickHex(centre);
    await page.keyboard.up('Shift');

    await expect.poll(() => settlement.longhouseBuildingLevel()).toBe(before + 1);
    await expect(settlement.ring.bubbles).toHaveCount(0);
  });

  test('a plain click still opens the ring and orders nothing', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, true);
    const centre = await settlement.centreHex();
    const before = await settlement.longhouseBuildingLevel();

    await settlement.clickHex(centre);
    await settlement.ring.waitForOpen();

    expect(await settlement.longhouseBuildingLevel()).toBe(before);
  });

  test('while Shift is held the tooltip over an own building shows what a click would upgrade to', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, true);
    const centre = await settlement.centreHex();
    const box = await settlement.canvasBox();
    await page.mouse.move(box.x + centre.screen.x, box.y + centre.screen.y, { steps: 3 });
    await expect(settlement.tooltip).toBeVisible();
    await expect(settlement.tooltip.getByTestId('tooltip-upgrade')).toHaveCount(0);

    await page.keyboard.down('Shift');
    await expect(settlement.tooltip.getByTestId('tooltip-upgrade')).toContainText('Shift+click: upgrade to level 2');
    await page.keyboard.up('Shift');
    await expect(settlement.tooltip.getByTestId('tooltip-upgrade')).toHaveCount(0);
  });
});

test.describe('quick upgrade for a free account', { tag: '@g2' }, () => {
  test('Shift+click opens the ring like a plain click, and the tooltip says it is premium', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, false);
    const centre = await settlement.centreHex();
    const box = await settlement.canvasBox();
    const before = await settlement.longhouseBuildingLevel();

    await page.mouse.move(box.x + centre.screen.x, box.y + centre.screen.y, { steps: 3 });
    await page.keyboard.down('Shift');
    await expect(settlement.tooltip.getByTestId('tooltip-upgrade')).toHaveText('Premium: Shift+click upgrades');

    await settlement.clickHex(centre);
    await page.keyboard.up('Shift');
    await settlement.ring.waitForOpen();
    expect(await settlement.longhouseBuildingLevel()).toBe(before);
  });
});

test.describe('quick upgrade mode on a phone', { tag: '@g3' }, () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('holding the Upgrade bubble turns the mode on, a tap upgrades another building, a long press on the map turns it off', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, true);
    const chip = page.getByTestId('quick-upgrade-chip');
    const centre = await settlement.centreHex();
    const longhouseBefore = await settlement.longhouseBuildingLevel();
    const others = (await settlement.hud.ownedBuildings()).filter((b) => b.type !== 'longhouse');
    expect(others.length).toBeGreaterThan(0);
    const other = others[0];
    const otherBefore = other.level;

    // Open the longhouse's ring and hold its Upgrade bubble with a real finger until the mode shows.
    await settlement.clickHex(centre);
    await settlement.ring.waitForOpen();
    const upgrade = settlement.ring.action('Upgrade').first();
    await expect(upgrade).toBeVisible();
    const bubble = (await upgrade.boundingBox())!;
    await fingerDown(page, { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 });
    await expect(chip).toBeVisible();
    await fingerUp(page);

    // The hold ordered the longhouse's upgrade, and the ring is gone.
    await expect.poll(() => settlement.longhouseBuildingLevel()).toBe(longhouseBefore + 1);
    await expect(settlement.ring.backdrop).toHaveCount(0);

    // A tap on another own building upgrades it, with no ring.
    const box = await settlement.canvasBox();
    const otherScreen = await settlement.screenOf(other);
    await page.touchscreen.tap(box.x + otherScreen.x, box.y + otherScreen.y);
    await expect.poll(async () => (await settlement.hud.ownedBuildings()).find((b) => b.q === other.q && b.r === other.r)?.level).toBe(otherBefore + 1);
    await expect(settlement.ring.backdrop).toHaveCount(0);
    await expect(chip).toBeVisible();

    // A long press anywhere on the map ends the mode.
    const empty = (await settlement.findHex({ terrain: 'grass' })).screen;
    await fingerDown(page, { x: box.x + empty.x, y: box.y + empty.y });
    await expect(chip).toBeHidden();
    await fingerUp(page);
    await expect(settlement.ring.backdrop).toHaveCount(0);
  });

  test('the chip\'s cross ends the mode, and a tap on an empty hex opens the ring while it is on', async ({ page, adminAuth }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundAs(page, adminAuth, true);
    const chip = page.getByTestId('quick-upgrade-chip');
    const centre = await settlement.centreHex();

    await settlement.clickHex(centre);
    await settlement.ring.waitForOpen();
    const bubble = (await settlement.ring.action('Upgrade').first().boundingBox())!;
    await fingerDown(page, { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 });
    await expect(chip).toBeVisible();
    await fingerUp(page);

    const empty = await settlement.findHex({ terrain: 'grass' });
    const box = await settlement.canvasBox();
    await page.touchscreen.tap(box.x + empty.screen.x, box.y + empty.screen.y);
    await settlement.ring.waitForOpen();
    await expect(chip).toBeVisible();

    // Esc is the ring's while it is open: it closes the ring and leaves the mode on.
    await page.keyboard.press('Escape');
    await expect(settlement.ring.backdrop).toHaveCount(0);
    await expect(chip).toBeVisible();
    // The chip's ✕ ends the mode.
    await page.getByTestId('quick-upgrade-stop').tap();
    await expect(chip).toBeHidden();
  });
});

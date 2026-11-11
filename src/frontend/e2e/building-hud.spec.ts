import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * docs/design/building-hud.md: every own building has a hex dial marker over it (walls excepted), the marker shows more as the
 * map zooms in, the whole HUD switches off and on (icon button, H) and the choice is kept, markers never take the pointer, and
 * while the HUD is on its dial replaces the canvas construction dial of a running upgrade. What a marker's rows say is
 * unit-tested (buildingHud.test.ts, BuildingHudLayer.test.ts); this is the wiring to the real map.
 */
// DOM and game state only: water and fog pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false, fog: false } });

test.describe('building HUD', { tag: '@g2' }, () => {
  test('own buildings and bridges get a marker, walls do not', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;

    const farm = (await settlement.findHex({ terrain: 'grass' })).hex;
    await hud.standBuildingAt(farm, 'farm', 1);
    const wall = (await settlement.findHex({ terrain: 'grass' })).hex;
    await hud.standBuildingAt(wall, 'palisade', 1);
    // Demo mode never lays rivers on its own: `withRiver` puts one under the hex it returns, which the bridge then spans.
    const bridge = (await settlement.findHex({ withRiver: true })).hex;
    await hud.standBuildingAt(bridge, 'bridge', 1);

    const owned = await hud.ownedBuildings();
    expect(owned.map((b) => b.type)).toEqual(expect.arrayContaining(['longhouse', 'farm', 'palisade', 'bridge']));
    const withMarker = owned.filter((b) => b.type !== 'palisade' && b.type !== 'palisadegate');

    await expect(hud.markers).toHaveCount(withMarker.length);
    await expect(hud.marker(farm)).toHaveCount(1);
    await expect(hud.marker(bridge)).toHaveCount(1);
    await expect(hud.marker(wall)).toHaveCount(0);
  });

  test('zooming in grows a marker from the bare ring to the dial with its number, the box, then the full box', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;
    const { hex } = await settlement.centreHex();
    // A farm shows a production row, which only the near box spells out ("/h").
    const farm = (await settlement.findHex({ terrain: 'grass' })).hex;
    await hud.standBuildingAt(farm, 'farm', 1);

    // zs = camera zoom / 0.85 (the default); the tiers start at zs 0.69 (number), 0.91 (box) and 1.3 (full box).
    await settlement.zoomTo(0.45);
    await expect(hud.marker(hex)).toHaveAttribute('data-tier', 'far');
    await expect(hud.dial(hex)).toBeVisible();
    await expect(hud.dialLabel(hex)).toHaveCount(0);
    await expect(hud.box(hex)).toHaveCount(0);

    await settlement.zoomTo(0.68);
    await expect(hud.marker(hex)).toHaveAttribute('data-tier', 'dial');
    await expect(hud.dialLabel(hex)).toHaveText('1');
    await expect(hud.box(hex)).toHaveCount(0);

    await settlement.zoomTo(0.85);
    await expect(hud.marker(farm)).toHaveAttribute('data-tier', 'mid');
    await expect(hud.dialLabel(farm)).toHaveText('1');
    await expect(hud.box(farm)).toBeVisible();
    await expect(hud.box(farm).locator('.hud-rows--mid')).toHaveCount(1);
    await expect(hud.box(farm)).not.toContainText('/h');

    await settlement.zoomTo(1.3);
    await expect(hud.marker(farm)).toHaveAttribute('data-tier', 'near');
    await expect(hud.box(farm).locator('.hud-rows--near')).toHaveCount(1);
    await expect(hud.box(farm)).toContainText('/h');
  });

  test('the toggle button and the H key hide and show every marker, and the choice is kept across a reload', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;
    const total = (await hud.ownedBuildings()).length;
    await expect(hud.markers).toHaveCount(total);
    await expect(hud.toggle).toHaveAttribute('aria-pressed', 'true');

    await hud.toggle.click();
    await expect(hud.markers).toHaveCount(0);
    await expect(hud.toggle).toHaveAttribute('aria-pressed', 'false');

    await hud.toggle.click();
    await expect(hud.markers).toHaveCount(total);
    await expect(hud.toggle).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('h');
    await expect(hud.markers).toHaveCount(0);
    await expect(hud.toggle).toHaveAttribute('aria-pressed', 'false');

    // Demo mode keeps the settlement in memory only, so a reload starts a new one: the preference is what must carry over.
    const reloaded = await SettlementPage.found(page);
    await expect(reloaded.hud.toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(reloaded.hud.markers).toHaveCount(0);

    await page.keyboard.press('h');
    await expect(reloaded.hud.markers).not.toHaveCount(0);
    await expect(reloaded.hud.toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('a marker never takes the pointer: the hex under its dial opens its ring, while the tile tooltip stays away', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;
    const { hex } = await settlement.centreHex();
    await settlement.zoomTo(1.3);
    await expect(hud.marker(hex)).toHaveAttribute('data-tier', 'near');

    // The point on the screen where the marker's dial is drawn: half a tile above the longhouse, i.e. over the hex beside it.
    const dialBox = await hud.dial(hex).boundingBox();
    expect(dialBox).not.toBeNull();
    const at = { x: dialBox!.x + dialBox!.width / 2, y: dialBox!.y + dialBox!.height / 2 };
    // The pointer goes through the marker to the map: the browser hands the event to the canvas, not to the dial.
    expect(await hud.elementTagAt(at)).toBe('CANVAS');

    await page.mouse.move(at.x, at.y, { steps: 4 });
    // The marker is hovered (it grows): the tile tooltip does not show while it is.
    await expect(hud.marker(hex)).toHaveAttribute('style', /scale\((1\.9|2\.)/);
    await expect(settlement.tooltip).toHaveCount(0);

    await page.mouse.click(at.x, at.y);
    await settlement.ring.waitForOpen();
    await expect(settlement.ring.backdrop).toHaveCount(1);
  });

  test('while building info is on, its dial shows a running upgrade and the canvas dial is not drawn; off, the canvas dial is back', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;
    const farm = (await settlement.findHex({ terrain: 'grass' })).hex;
    const key = `${farm.q},${farm.r}`;
    await hud.standBuildingAt(farm, 'farm', 1);
    // The number inside the dial shows from the dial tier on (the default framing of a young realm is the far one).
    await settlement.zoomTo(0.85);
    await expect(hud.dialLabel(farm)).toHaveText('1');
    await expect.poll(() => hud.canvasDialKeys()).toEqual([]);

    await hud.startUpgrade(farm, 'farm', 2);
    // The marker's dial counts down (m:ss, about 8:20 left) instead of showing the level, and the canvas draws nothing for it.
    await expect(hud.dialLabel(farm)).toHaveText(/^\d+:\d\d$/);
    await expect.poll(() => hud.canvasDialKeys()).not.toContain(key);

    await hud.toggle.click();
    await expect(hud.markers).toHaveCount(0);
    await expect.poll(() => hud.canvasDialKeys()).toContain(key);

    await hud.toggle.click();
    await expect(hud.dialLabel(farm)).toHaveText(/^\d+:\d\d$/);
    await expect.poll(() => hud.canvasDialKeys()).not.toContain(key);
  });
});

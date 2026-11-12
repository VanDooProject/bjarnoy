import { expect, test } from './fixtures';
import { longestTask, observeLongTasks, putFleetsFarAtSea, refreshArmies } from './helpers';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { readFileSync } from 'node:fs';

// The English text the picker shows for a row with no route (the spec cannot import JSON as a module).
const enHud = JSON.parse(readFileSync(new URL('../src/i18n/locales/en/hud.json', import.meta.url), 'utf8')) as {
  sendPicker: { reasons: { unreachable: string } };
};

// DOM and game state only: water pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false } });

// The send picker lists every army in the field with a verdict for the target, which needs a route search per army. A search that finds no
// route used to run to the 250,000-hex cap on the main thread (~1.7 s each, re-run on every armies refresh): five fleets out froze the
// page for many seconds. Now an unreachable goal is answered at once by the reverse probe, and a long search that does have a route is
// sliced and run in the background.
test.describe('send picker with armies far away', () => {
  test('opening the picker and refreshing the armies with five far-away fleets out does not freeze the page, and every fleet ends up unreachable', { tag: '@g3' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await putFleetsFarAtSea(page);
    await observeLongTasks(page);

    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await settlement.ring.click(settlement.ring.action('Send army here').first());
    const picker = page.locator('.send-picker');
    await expect(picker).toBeVisible();
    // An armies refresh while the picker is open (what the live poll does) re-evaluates every row.
    await refreshArmies(page);

    const unreachable = enHud.sendPicker.reasons.unreachable;
    for (let i = 0; i < 5; i++) {
      const row = picker.locator(`[data-source="fleet-${i}"]`);
      await expect(row).toContainText(unreachable);
      await expect(row).toHaveClass(/is-off/);
    }
    await refreshArmies(page);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const longest = await longestTask(page);
    // Before: one task of many seconds. 3 s leaves room for a software-rendered CI frame and still fails the regression.
    expect(longest, 'a main-thread task while opening the picker took this long (ms)').toBeLessThan(3_000);
  });

  test('a coastal own hex as the target runs real long sea searches in the background: no freeze, and every fleet ends up with a travel time', { tag: '@g3' }, async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await settlement.setSettlementLevel(8);
    // A good start has no sea within two hexes: push the realm's border to the shore, then aim at an own sea hex there.
    const reach = await settlement.standTowerTowardCoast();
    const target = await settlement.findHex({ terrain: 'sea', coastalWater: true, reach });
    // The fleets' leg has to return home as well, and the longhouse is inland: their home is the shore hex itself.
    await putFleetsFarAtSea(page, target.hex);
    await observeLongTasks(page);

    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await settlement.ring.click(settlement.ring.action('Send army here').first());
    const picker = page.locator('.send-picker');
    await expect(picker).toBeVisible();
    await refreshArmies(page);

    for (let i = 0; i < 5; i++) {
      const row = picker.locator(`[data-source="fleet-${i}"]`);
      await expect(row.locator('.send-row-eta')).not.toHaveText('');
      await expect(row).not.toHaveClass(/is-off/);
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const longest = await longestTask(page);
    expect(longest, 'a main-thread task while the fleets\' routes were searched took this long (ms)').toBeLessThan(3_000);
  });
});

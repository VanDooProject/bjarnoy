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
// page for many seconds. Now an unreachable goal fails fast and every search is sliced and run in the background.
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
});

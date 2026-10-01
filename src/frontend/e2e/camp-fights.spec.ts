import { expect } from '@playwright/test';
import { test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Wildlife camp rules the settlement view surfaces (docs/design/wildlife-camps.md, Gameplay):
 * a tower inside a strong camp's guard range is allowed but warned about, and a camp hex can
 * only be built on once the camp is empty. Demo mode has no army simulation, so the camps are
 * injected through the demo-world debug hook (`window.__demoWorld`, main.ts) next to a real,
 * owned hex rather than hoping the seed puts one there.
 */

type Hex = { q: number; r: number };

async function addCamp(page: import('@playwright/test').Page, family: string, at: Hex, level = 2) {
  await page.evaluate(
    ({ family, at, level }) => {
      const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
      world.model.setCamps([{ family, coord: at, level, orientation: 'SE' }]);
    },
    { family, at, level },
  );
}

async function setCampState(page: import('@playwright/test').Page, at: Hex, empty: boolean) {
  await page.evaluate(
    ({ at, empty }) => {
      const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
      const camp = world.model.campAt(at);
      const garrison = empty ? { young: 0, adult: 0, alpha: 0 } : { young: 3, adult: 6, alpha: 1 };
      world.model.setCampStates([
        {
          q: at.q,
          r: at.r,
          family: camp.family,
          level: camp.level,
          effectiveLevel: camp.level,
          strong: camp.strong,
          guardRange: camp.guardRange,
          garrison,
          fullGarrison: { young: 3, adult: 6, alpha: 1 },
          empty,
          calmUntil: null,
          aggressive: !empty,
          clears: empty ? 1 : 0,
          removed: false,
          leftover: { wood: 0, stone: 0, food: 0, iron: 0 },
        },
      ]);
    },
    { at, empty },
  );
}

/** The axial hex `steps` hexes east of `from`. */
const eastOf = (from: Hex, steps: number): Hex => ({ q: from.q + steps, r: from.r });

test.describe('wildlife camps in the settlement view', () => {
  test('a watchtower inside a strong camp range is warned about, not locked', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await settlement.setSettlementLevel(3);
    const target = await settlement.findHex({ terrain: 'grass' });

    // A level 2 wolf den guards 4 hexes; 3 hexes away puts the target well inside.
    await addCamp(page, 'wolfden', eastOf(target.hex, 3));

    await settlement.clickHex(target);
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Military');
    const watchtower = settlement.ring.child('Watchtower').first();
    await settlement.ring.hover(watchtower);

    await expect(settlement.ring.card).toContainText('Wild beasts will burn this tower unless an army stands guard on it.');
    await expect(watchtower).not.toHaveClass(/locked/);
  });

  test('a weak camp nearby does not warn about a watchtower', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await settlement.setSettlementLevel(3);
    const target = await settlement.findHex({ terrain: 'grass' });

    // Weak camps never attack (only strong ones do), so they never threaten a tower.
    await addCamp(page, 'harewarren', eastOf(target.hex, 1));

    await settlement.clickHex(target);
    await settlement.ring.openBuildCategories();
    await settlement.ring.openCategory('Military');
    const watchtower = settlement.ring.child('Watchtower').first();
    await settlement.ring.hover(watchtower);

    await expect(settlement.ring.card).toBeVisible();
    await expect(settlement.ring.card).not.toContainText('Wild beasts');
  });

  test('a guarded camp hex cannot be built on, an emptied one can', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    await addCamp(page, 'harewarren', target.hex, 1);

    await settlement.clickHex(target);
    const build = settlement.ring.action('Build').first();
    await expect(build).toBeVisible();
    await expect(build).toHaveClass(/disabled|locked/);
    // A disabled ring action explains itself in its tooltip (RingMenu.vue's `title`).
    await expect(build).toHaveAttribute('title', 'Occupied by wild beasts');

    // Close the ring, empty the camp (what a won hunt does server-side) and try again.
    await page.keyboard.press('Escape');
    await expect(settlement.ring.bubbles).toHaveCount(0);
    await setCampState(page, target.hex, true);

    await settlement.clickHex(target);
    await expect(settlement.ring.action('Build').first()).not.toHaveClass(/disabled|locked/);
    await settlement.ring.openBuildCategories();
    await expect(settlement.ring.category('Military').first()).toBeVisible();
  });
});

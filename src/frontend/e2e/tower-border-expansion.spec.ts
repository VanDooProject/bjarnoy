import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Regression coverage for the realm-border/Tower mismatch: WorldModel's
 * live-mode path (`applyServerSnapshot`) used to ignore Tower buildings
 * entirely, so a settlement's realm border always rendered as the
 * longhouse's centre disc alone, no matter how many towers stood — even
 * though the backend's own claim (`Settlement.Claims`/`ClaimDiscsFor`)
 * already counted each Tower's satellite disc. See `WorldModel.test.ts`'s
 * matching unit coverage for the same fix at the model level; this spec
 * drives the same code path through the real running app (the built SPA
 * `playwright.config.ts` boots — see `settlement-expansion.spec.ts`'s own
 * scope note on why every spec here is demo-mode only) and asserts the
 * change is visible on screen, not just in `WorldModel`'s internal state.
 *
 * Demo mode has no build queue or leveling (see that same scope note), so
 * there's no way to click a Tower up to level 4 through the UI — this uses
 * the same `__demoWorld` "drive WorldModel directly" hook `helpers.ts`'s
 * own `foundSettlement` already relies on for exactly this reason, calling
 * `applyServerSnapshot` (the fixed method) the same way a real poll would
 * once the backend reports a levelled-up Tower.
 */
test.describe('tower border expansion (realm borders)', { tag: '@g2' }, () => {
  test('a level-1 tower claims no extra ground, but a live Tower snapshot extends the rendered border past it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);

    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    // Places a level-1 tower at the settlement's border edge, then forces a
    // redraw so it's fully painted before either screenshot is taken —
    // isolating the before/after diff below to the *border* claim, not the
    // tower's own sprite appearing. Returns the screen point of a hex two
    // rings past the tower (inside a level-4 tower's own satellite disc,
    // radius 2, but well outside the tower itself) for the screenshot clip —
    // deliberately excluding the tower's own hex, since its sprite does
    // change between the two screenshots (level 1 -> 4) for a reason
    // unrelated to what this test checks.
    const setup = await page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => {
          hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
          forceRebuild: () => void;
        };
      };
      const world = win.__demoWorld();
      const model = world.model;
      const settlement = model.getSettlement(world.selectedSettlementId);
      const at = { q: settlement.q, r: settlement.r };
      const radius = model.borderRadius(settlement);

      function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }) {
        const dq = a.q - b.q;
        const dr = a.r - b.r;
        return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
      }

      // A land hex exactly at the border's own edge, in a fixed direction —
      // the only place a level-1 tower may legally be placed that also has
      // room to extend further outward once it levels up.
      const DIRS: Array<[number, number]> = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
      ];
      let towerAt: { q: number; r: number } | null = null;
      for (const [dq, dr] of DIRS) {
        const c = { q: at.q + dq * radius, r: at.r + dr * radius };
        if (hexDistance(at, c) === radius && model.isLand(c.q, c.r)) {
          towerAt = c;
          break;
        }
      }
      if (!towerAt) throw new Error('no land border-edge hex found for this seed');

      const placed = model.placeBuilding(world.selectedSettlementId, towerAt, 'tower');
      if (!placed) throw new Error('failed to place the level-1 tower at the border edge');
      win.__settlementRenderer().forceRebuild();

      // The first direction (of the same six) that, continued two more
      // steps from the tower, lands outside the centre disc — not
      // necessarily "straight out" from the settlement, just guaranteed to
      // exist: continuing in whichever direction originally placed the
      // tower on the border's edge always qualifies, so this never falls
      // through to the `!` below.
      const farDir = DIRS.find(
        ([dq, dr]) => hexDistance(at, { q: towerAt!.q + dq * 2, r: towerAt!.r + dr * 2 }) > radius,
      )!;
      const farHex = { q: towerAt.q + farDir[0] * 2, r: towerAt.r + farDir[1] * 2 };
      const farScreen = win.__settlementRenderer().hexCenterScreen(farHex);

      return { towerAt, farHex, farScreen, settlementId: world.selectedSettlementId as string };
    });

    // Regression guard: a fresh (level-1) tower's own satellite disc has
    // radius 0 (Settlement.TowerClaimRadius(1) == 0) — the old bug flatly
    // claimed a radius-1 ring around every tower regardless of level.
    const farClaimedAfterPlacingOnly = await page.evaluate(
      ({ farHex, settlementId }) => {
        const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
        return world.model.getTile(farHex.q, farHex.r).ownerId === settlementId;
      },
      { farHex: setup.farHex, settlementId: setup.settlementId },
    );
    expect(farClaimedAfterPlacingOnly).toBe(false);

    // A tight box around just the far hex, clamped inside the canvas itself
    // (not only at 0 — also at the canvas's own far edge) so the screenshot
    // never throws if this seed happens to land the hex near an edge.
    const HALF = 70;
    const desired = {
      x: box.x + setup.farScreen.x - HALF,
      y: box.y + setup.farScreen.y - HALF,
      width: HALF * 2,
      height: HALF * 2,
    };
    const clip = {
      x: Math.max(box.x, desired.x),
      y: Math.max(box.y, desired.y),
      width: Math.min(box.x + box.width, desired.x + desired.width) - Math.max(box.x, desired.x),
      height: Math.min(box.y + box.height, desired.y + desired.height) - Math.max(box.y, desired.y),
    };
    const before = await page.screenshot({ clip });

    // Report the same tower back at level 4 through applyServerSnapshot —
    // the live-mode poll path the original bug report was about — and force
    // the renderer to redraw immediately rather than waiting for the next
    // camera-triggered rebuild.
    const farClaimedAfterSnapshot = await page.evaluate(
      ({ towerAt, farHex, settlementId }) => {
        const win = window as unknown as {
          __demoWorld: () => { model: any; selectedSettlementId: string };
          __settlementRenderer: () => { forceRebuild: () => void };
        };
        const world = win.__demoWorld();
        const model = world.model;
        const settlement = model.getSettlement(settlementId);

        model.applyServerSnapshot(settlementId, {
          level: settlement.level,
          resources: settlement.resources,
          rates: settlement.rates,
          capacity: settlement.capacity ?? { wood: 0, stone: 0, food: 0, iron: 0 },
          buildings: [{ q: towerAt.q, r: towerAt.r, type: 'tower', level: 4 }],
        });
        win.__settlementRenderer().forceRebuild();

        return model.getTile(farHex.q, farHex.r).ownerId === settlementId;
      },
      { towerAt: setup.towerAt, farHex: setup.farHex, settlementId: setup.settlementId },
    );
    expect(farClaimedAfterSnapshot).toBe(true);

    // One real painted frame past forceRebuild's synchronous PixiJS graphics
    // update, matching waitForMapReady's own double-rAF wait elsewhere in
    // this suite.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
    );
    const after = await page.screenshot({ clip });

    // The rendered border literally moved: this region — the far hex and its
    // immediate surroundings, with the tower itself out of frame — now draws
    // the gold realm wash/glow where it didn't before. Nothing else in this
    // clip changes between the two shots (no camera movement, no other
    // building placed, no ambient animation source this close to the map's
    // edge), so this diff is attributable to the claim change alone.
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});

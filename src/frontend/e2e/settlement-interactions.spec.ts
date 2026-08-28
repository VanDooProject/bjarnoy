import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

test.describe('settlement view interactions', () => {
  test('hovering a hex renders a highlight that follows the cursor', async ({ page }) => {
    // foundSettlement() alone (page load + a real PixiJS/texture mount) can
    // already run close to the global 45s budget under software-rendered
    // headless Chromium, before this test's own interaction — see the
    // panning test's comment below for the same reasoning.
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The settlement camera always centres on the longhouse, so hexes at
    // these offsets are reliably on screen regardless of where in the
    // (randomly seeded) world the settlement actually landed — but the
    // zoom picked for a level-1 realm (zoomForFogMargin) is small enough
    // that a much larger offset here used to land right on (or past) the
    // explored ring's edge, which the hex-offset grid's stagger can push
    // either side of depending on the settlement's own axial parity. These
    // offsets are well inside the guaranteed border+explored radius.
    const clip = { x: cx - 130, y: cy - 230, width: 260, height: 220 };

    const tooltip = page.locator('.hex-tooltip');

    // top-left corner of the canvas is well outside the level-1 border-2
    // realm — a reliable "nothing hovered" baseline (unexplored hexes
    // aren't drawn at all, hover included)
    await page.mouse.move(box.x + 5, box.y + 5);
    await expect(tooltip).toBeHidden();
    const idle = await page.screenshot({ clip });

    // A fixed waitForTimeout here raced the renderer's own frame cadence
    // (CI's software-rendered Chromium doesn't paint on a predictable
    // schedule) — the tooltip mounting is the actual signal the hover took
    // effect, so wait on that instead of guessing how long a frame takes.
    await page.mouse.move(cx, cy - 60, { steps: 6 });
    await expect(tooltip).toBeVisible();
    const hoverA = await page.screenshot({ clip });
    expect(Buffer.compare(idle, hoverA)).not.toBe(0);

    // Position (not text) is what reliably distinguishes the two hovers:
    // two different hexes can share the same terrain label ("Grassland" /
    // "Unclaimed"), but the tooltip is anchored to the hovered hex's own
    // screen coordinates, so a real hex change always moves it.
    const hoverALeft = await tooltip.evaluate((el) => (el as HTMLElement).style.left);
    await page.mouse.move(cx - 45, cy - 15, { steps: 6 });
    await expect(tooltip).not.toHaveCSS('left', hoverALeft);
    const hoverB = await page.screenshot({ clip });
    expect(Buffer.compare(hoverA, hoverB)).not.toBe(0);
  });

  test('clicking an empty hex inside the realm places a building', async ({ page }) => {
    // Same reasoning as the hover/panning tests above: foundSettlement()
    // plus driving a real click through the render runs close to (and on
    // CI, over) the global 45s budget.
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    // A guessed pixel offset from the canvas centre only happens to land on
    // a real hex at one particular zoom/camera framing — zoomForFogMargin
    // picks a much tighter zoom than that for a level-1 realm, so a fixed
    // offset tuned by eyeballing one run is exactly the kind of thing that
    // silently stops landing on a hex when the framing shifts. Instead, ask
    // the model for a real empty hex inside the realm, then ask the
    // renderer's own camera math (__settlementRenderer's hexCenterScreen,
    // set up by SettlementView for exactly this) for that hex's exact
    // screen position.
    const point = await page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(settlement);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId === world.selectedSettlementId && tile.terrain !== 'sea' && !tile.buildingType) {
            return win.__settlementRenderer().hexCenterScreen(at);
          }
        }
      }
      throw new Error('no empty buildable hex found inside the realm');
    });

    // The model, via the __demoWorld debug hook, is the deterministic
    // "did the build land" signal — a fixed sleep before checking it either
    // wastes time once it's actually placed or, on a loaded CI runner,
    // checks before the async model update has happened.
    const countBuildings = () =>
      page.evaluate(() => {
        const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
          .__demoWorld();
        return world.model.countBuildings(world.selectedSettlementId) as number;
      });
    const before = await countBuildings();

    // zip 9: a hex click opens BuildingModal (full-screen detail screen) —
    // it, not the click itself, places the building, via its own "Build
    // here" button (only rendered for an owned, buildable, still-empty
    // hex; see BuildingModal.vue's `mine && buildable` actions guard).
    const modal = page.locator('.modal.panel');
    await page.mouse.click(box.x + point.x, box.y + point.y);
    await modal.getByRole('button', { name: 'Build here' }).click();

    await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);
  });

  test('panning the settlement view does not error', async ({ page }) => {
    // This test's own footprint is small (a 10-step drag plus two full
    // canvas screenshots), but foundSettlement() plus a real drag through
    // the live PixiJS scene has been observed taking 70-90s under
    // software-rendered headless Chromium — most of it genuine page-load
    // and rendering cost (confirmed by profiling: an isolated 10-step
    // mouse-move loop on a blank page takes ~300ms, so it isn't CDP/network
    // overhead). The global 45s default is deliberately tight to catch
    // regressions fast elsewhere; this test and the hover one above are two
    // of the tests that both found a settlement AND drive real interaction
    // through it, so they get more room rather than the whole suite's
    // budget loosened to cover them.
    //
    // This one specifically failed to finish inside 90s on two consecutive
    // real CI runs (once as a bare mouse.move timeout, once as "Element is
    // not attached to the DOM" after a WebGL "GPU stall" warning) despite
    // completing locally in 72-78s both times — CI's run-to-run variance
    // is evidently wider than 90s leaves room for. 120s rather than
    // shrugging this off as a repeat flake.
    test.setTimeout(120_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await canvas.screenshot();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx - i * 25, cy - i * 8);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});

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
    const target = await page.evaluate(() => {
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

    // Issue #16: a hex click no longer opens BuildingModal directly — it
    // opens a RingMenu of contextual actions; hovering its "Build" bubble
    // drills into a category ring, and hovering a category bubble drills
    // into that category's building-type ring (see SettlementView's
    // onRingHover — only the root "build" action and a category's own
    // bubbles advance the ring on hover; everything else, including the
    // final building choice, needs a real click). Drilling via hover here
    // (not the click-based path onRingSelect also supports) matches
    // ring-menu.spec.ts's own drill-down coverage — the interaction path
    // that suite already exercises and keeps green, rather than a second,
    // untried one: a click-based version of this same test was flaky here,
    // repeatedly racing the ring bubble getting detached and re-mounted
    // mid-click on a loaded run, something hover-then-click rides out fine.
    await page.mouse.click(box.x + target.x, box.y + target.y);

    const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' }).first();
    await expect(buildBubble).toBeVisible();
    const buildBox = (await buildBubble.boundingBox())!;
    await page.mouse.move(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2, { steps: 6 });

    // On grass terrain the category ring has three bubbles (Housing,
    // Resource, Defense); every other buildable terrain has just the one
    // ("Build", reused as both the root action's label and its sole
    // category's — see BUILD_CATEGORIES). Either way, whichever category is
    // first leads to "Hut" as its first building (Housing's only building;
    // "Build"'s own list starts with Hut too), so hovering the first
    // category bubble and clicking the first building bubble always reaches
    // a real, placeable building regardless of which terrain was picked.
    // Issue #16 follow-up "concentric rings": the root ring's own bubbles
    // are still on screen at this point (a plain `.ring-bubble` locator
    // would grab one of those instead) — the category ring is specifically
    // the one *without* its own backdrop (see RingMenu's `backdrop` prop,
    // false for every ring but the innermost), so scope through that rather
    // than by label text, which the "other"-terrain category can share
    // with the root "Build" bubble ("Build" is reused as both).
    const categoryBubble = page.locator('.ring-backdrop.no-backdrop .ring-bubble').first();
    await expect(categoryBubble).toBeVisible();
    // Issue #16 follow-up "concentric rings": drilling into the category
    // ring opens a new, wider ring around the same tile rather than
    // replacing the root ring — "Details" (a root-ring action) stays put.
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(1);
    const categoryBox = (await categoryBubble.boundingBox())!;
    await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
      steps: 6,
    });

    const hutBubble = page.locator('.ring-bubble', { hasText: 'Hut' }).first();
    await expect(hutBubble).toBeVisible();
    await hutBubble.click();

    await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);
  });

  test('placing a lumberjack on a forest hex is a real, terrain-gated building', async ({ page }) => {
    // Same reasoning as the other tests here: foundSettlement() plus driving
    // a real click through the render runs close to the global 45s budget.
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    // Lumberjack/Quarry only recently gained frontend support (they were
    // previously silently dropped by WorldModel.applyServerSnapshot's
    // RENDERABLE_TYPES whitelist, and had no entry in Tile['buildingType']
    // at all) — this test is the regression guard for that, so it
    // deliberately targets a Forest hex rather than accepting whatever the
    // first buildable hex happens to be (the other placement test's job).
    const target = await page.evaluate(() => {
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
          if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'forest' && !tile.buildingType) {
            const screen = win.__settlementRenderer().hexCenterScreen(at);
            return { at, screen };
          }
        }
      }
      throw new Error('no empty forest hex found inside the realm — pick a different demo seed');
    });

    const getBuildingTypeAtTarget = () =>
      page.evaluate((coord) => {
        const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
          .__demoWorld();
        return world.model.getTile(coord.q, coord.r).buildingType as string | undefined;
      }, target.at);
    expect(await getBuildingTypeAtTarget()).toBeUndefined();

    await page.mouse.click(box.x + target.screen.x, box.y + target.screen.y);

    const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' }).first();
    await expect(buildBubble).toBeVisible();
    const buildBox = (await buildBubble.boundingBox())!;
    await page.mouse.move(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2, { steps: 6 });

    // Forest is non-grass terrain, so it gets the single "Build" category
    // (BUILD_CATEGORIES' `other` bucket) rather than grass's three-category
    // spread — see SettlementView's categoriesFor.
    const categoryBubble = page.locator('.ring-backdrop.no-backdrop .ring-bubble').first();
    await expect(categoryBubble).toBeVisible();
    const categoryBox = (await categoryBubble.boundingBox())!;
    await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
      steps: 6,
    });

    const lumberjackBubble = page.locator('.ring-bubble', { hasText: 'Lumberjack' }).first();
    await expect(lumberjackBubble).toBeVisible();
    await lumberjackBubble.click();

    await expect.poll(getBuildingTypeAtTarget, { timeout: 5_000 }).toBe('lumberjack');
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

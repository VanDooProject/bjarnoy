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
          // Grass specifically: it's the one terrain where every category's
          // first building (Hut) has no longhouse-level gate at all, so a
          // fresh level-1 realm can always actually place it — sand/forest/
          // mountain's own categories (Tower, shrines) are gated and would
          // make this generic "does the click-to-build flow work" smoke
          // test flaky on whichever terrain the scan happened to hit first.
          if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'grass' && !tile.buildingType) {
            return win.__settlementRenderer().hexCenterScreen(at);
          }
        }
      }
      throw new Error('no empty buildable grass hex found inside the realm');
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

    // Grass's first category (Housing) has exactly one building — Hut — so
    // hovering the first category bubble and clicking the first building
    // bubble always reaches it, without needing to name it explicitly.
    //
    // The 2a ring caps itself at two lanes, so drilling *replaces* the root
    // actions with the categories rather than orbiting outside them —
    // `.child` is the outer lane, `.back` the reserved back slot, and what is
    // left is the categories.
    const categoryBubble = page.locator('.ring-bubble:not(.back):not(.child)').first();
    await expect(categoryBubble).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
    const categoryBox = (await categoryBubble.boundingBox())!;
    await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
      steps: 6,
    });

    const buildingBubble = page.locator('.ring-bubble.child').first();
    await expect(buildingBubble).toBeVisible();
    await buildingBubble.click();

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

    // Forest only offers what BuildingCatalogue.cs's AllowedTerrain actually
    // permits there — Lumberjack (Resource) and shrines (any land hex) —
    // rather than grass's four-category spread; see SettlementView's
    // categoriesFor/BUILD_CATEGORIES. The root "Build" action it shares a
    // label with is gone by now: the 2a ring swaps the inner lane on
    // drill-down instead of orbiting outside it.
    const categoryBubble = page.locator('.ring-bubble:not(.back):not(.child)').first();
    await expect(categoryBubble).toBeVisible();
    const categoryBox = (await categoryBubble.boundingBox())!;
    await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
      steps: 6,
    });

    const lumberjackBubble = page.locator('.ring-bubble.child', { hasText: 'Lumberjack' }).first();
    await expect(lumberjackBubble).toBeVisible();
    await lumberjackBubble.click();

    await expect.poll(getBuildingTypeAtTarget, { timeout: 5_000 }).toBe('lumberjack');
  });

  test('a shore (sand) hex only offers categories BuildingCatalogue.cs actually allows there', async ({ page }) => {
    // Regression guard: sand used to fall into the same flat "other" bucket
    // as forest/mountain and offer Farm/Lumberjack/Quarry — none of which
    // the backend's AllowedTerrain would ever accept on sand (Farm is
    // Grass-only, Lumberjack Forest-only, Quarry Mountain-only). Sand only
    // carries Tower (SandOrGrass) and the two shrines (any land hex).
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

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
          if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'sand' && !tile.buildingType) {
            return win.__settlementRenderer().hexCenterScreen(at);
          }
        }
      }
      throw new Error('no empty sand hex found inside the realm — pick a different demo seed');
    });

    await page.mouse.click(box.x + target.x, box.y + target.y);

    const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' }).first();
    await expect(buildBubble).toBeVisible();
    const buildBox = (await buildBubble.boundingBox())!;
    await page.mouse.move(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2, { steps: 6 });

    const categoryBubbles = page.locator('.ring-bubble:not(.back):not(.child)');
    await expect(categoryBubbles.first()).toBeVisible();
    const categoryLabels = await categoryBubbles.allTextContents();
    expect(new Set(categoryLabels)).toEqual(new Set(['Defense', 'Shrines']));

    for (const label of categoryLabels) {
      const category = page.locator('.ring-bubble:not(.back):not(.child)', { hasText: label }).first();
      const rect = (await category.boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 6 });
      await expect(page.locator('.ring-bubble.child').first()).toBeVisible();
      const buildingLabels = await page.locator('.ring-bubble.child').allTextContents();
      for (const forbidden of ['Farm', 'Pumpkin Farm', 'Lumberjack', 'Quarry', 'Hut', 'Magic Tower']) {
        expect(buildingLabels).not.toContain(forbidden);
      }
    }
  });

  test('the hex tooltip hides while hovering a HUD panel on top of the canvas', async ({ page }) => {
    // Issue #100: the canvas is `position: absolute; inset: 0`, covering the
    // whole viewport, so a bounding-rect test in updateHover always passes
    // even when the cursor is actually over an absolutely-positioned HUD
    // overlay like ArmyPanel's `.status-card` (bottom-right corner, z-index
    // above the canvas but below the tooltip) — the tooltip used to keep
    // rendering (and painting over the panel) while the player worked inside
    // it. This is the regression guard for the real hit-test fix
    // (`document.elementFromPoint` in updateHover).
    test.setTimeout(90_000);
    await foundSettlement(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const tooltip = page.locator('.hex-tooltip');

    // Establish the tooltip actually shows for a plain hex hover first, so
    // the panel check below is a real "it hides" signal rather than the
    // tooltip just never having appeared.
    await page.mouse.move(cx, cy - 60, { steps: 6 });
    await expect(tooltip).toBeVisible();

    // Move onto ArmyPanel's status card, which sits on top of the canvas in
    // the bottom-right corner — the tile "under" it (per the old rect test)
    // would still resolve to a real hex, so this is exactly the panel the
    // bug report calls out.
    const statusCard = page.locator('.status-card');
    await expect(statusCard).toBeVisible();
    const panelBox = (await statusCard.boundingBox())!;
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 20, { steps: 6 });
    await expect(tooltip).toBeHidden();

    // Moving back onto the map re-shows it — this isn't a one-way "hover
    // broke" state, the hit test just tracks the real element under the
    // cursor each move.
    await page.mouse.move(cx, cy - 60, { steps: 6 });
    await expect(tooltip).toBeVisible();
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

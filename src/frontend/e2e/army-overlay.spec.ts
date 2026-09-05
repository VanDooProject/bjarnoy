import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Issues #93 and #94: the settlement map's army/route overlay — draggable
 * draft waypoints, the attack/support target indicator, and an in-transit
 * army interpolated along its path rather than snapped to a hex.
 *
 * The overlay lives inside a WebGL canvas, so "is it drawn, and where"
 * is asserted through the renderer's own read-back of the frame it last drew
 * (`lastArmyOverlayFrame()`, reached via the `__settlementRenderer` debug hook
 * SettlementView already exposes for exactly this kind of coordinate maths),
 * backed up by screenshot diffs proving pixels really changed. That accessor
 * reports what the real draw path produced — nothing in the renderer branches
 * on whether a test is reading it.
 *
 * Army/dispatch state is seeded through the store (`__demoWorld`), the same
 * way settlement-interactions.spec.ts drives WorldModel directly: demo mode
 * has no backend to dispatch against, and `refreshArmies` is a no-op there,
 * so nothing overwrites what a test puts in. The *rendering* under test is
 * the live one either way.
 */

interface OverlayFrame {
  armies: { id: string; x: number; y: number; interpolated: boolean }[];
  waypoints: { index: number; x: number; y: number }[];
  targets: { kind: string; x: number; y: number }[];
  iconsReady: boolean;
}

// Local cast rather than a `declare global`, per e2e/AGENTS.md /
// globals.d.ts: `__demoWorld`/`__settlementRenderer` are deliberately not
// declared globally, so each spec states the exact slice it uses.
type OverlayWindow = Window & {
  __demoWorld: () => any;
  __settlementRenderer: () => {
    hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
    lastArmyOverlayFrame: () => OverlayFrame;
  };
};

test.describe('army overlay on the settlement map', { tag: '@g3' }, () => {
  test('a plotted waypoint can be dragged onto another hex', async ({ page }) => {
    // Same budget as the other tests that both found a settlement AND drive
    // real pointer interaction through the live PixiJS scene — see
    // settlement-interactions.spec.ts's own comments.
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const box = await settlement.canvasBox();

    // Plot a two-hex route around the settlement centre, then work out where
    // its first pin and the hex we want to drag it to actually are, via the
    // renderer's own camera maths rather than guessed pixel offsets.
    const geometry = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const first = { q: settlement.q + 1, r: settlement.r };
      const second = { q: settlement.q + 2, r: settlement.r };
      const dropOn = { q: settlement.q + 1, r: settlement.r + 1 };
      world.startDispatch();
      world.addWaypoint(first);
      world.addWaypoint(second);
      const renderer = (window as unknown as OverlayWindow).__settlementRenderer();
      return {
        first,
        second,
        dropOn,
        firstScreen: renderer.hexCenterScreen(first),
        dropScreen: renderer.hexCenterScreen(dropOn),
        settlementScreen: renderer.hexCenterScreen({ q: settlement.q, r: settlement.r }),
      };
    });

    const frame = () => page.evaluate(() => (window as unknown as OverlayWindow).__settlementRenderer().lastArmyOverlayFrame());
    // The pins have to have been drawn before they can be grabbed — the
    // renderer picks the overlay up on its next frame, not synchronously.
    await expect.poll(async () => (await frame()).waypoints.length, { timeout: 5_000 }).toBe(2);
    // The icon set is what the pins/arrows/banners are actually drawn from;
    // a silent load failure would fall back to plain shapes and quietly
    // hollow out this whole suite.
    expect((await frame()).iconsReady).toBe(true);

    const clip = {
      x: box.x + Math.min(geometry.firstScreen.x, geometry.dropScreen.x) - 80,
      y: box.y + Math.min(geometry.firstScreen.y, geometry.dropScreen.y) - 80,
      width: 220,
      height: 220,
    };
    const before = await page.screenshot({ clip });

    await page.mouse.move(box.x + geometry.firstScreen.x, box.y + geometry.firstScreen.y);
    await page.mouse.down();
    await page.mouse.move(box.x + geometry.dropScreen.x, box.y + geometry.dropScreen.y, { steps: 8 });
    await page.mouse.up();

    const route = await page.evaluate(() => (window as unknown as OverlayWindow).__demoWorld().dispatchDraft.route);
    // The dragged pin moved, the one after it didn't, and the drag did not
    // also append a third waypoint on release.
    expect(route).toHaveLength(2);
    expect(route[0]).toEqual(geometry.dropOn);
    expect(route[1]).toEqual(geometry.second);

    // Dragging a pin must not pan the camera — the same gesture on empty map
    // still does, so this is the part that distinguishes the two.
    const settlementScreenAfter = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      return (window as unknown as OverlayWindow).__settlementRenderer().hexCenterScreen({ q: settlement.q, r: settlement.r });
    });
    expect(settlementScreenAfter.x).toBeCloseTo(geometry.settlementScreen.x, 1);
    expect(settlementScreenAfter.y).toBeCloseTo(geometry.settlementScreen.y, 1);

    // And the map really redrew the pin in its new place.
    await expect
      .poll(async () => {
        const f = await frame();
        return Math.hypot(f.waypoints[0].x - geometry.dropScreen.x, f.waypoints[0].y - geometry.dropScreen.y);
      }, { timeout: 5_000 })
      .toBeLessThan(1);
    const after = await page.screenshot({ clip });
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test('a waypoint can be removed by index, not just undone from the end', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    const plotted = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      world.startDispatch();
      world.addWaypoint({ q: s.q + 1, r: s.r });
      world.addWaypoint({ q: s.q + 2, r: s.r });
      world.addWaypoint({ q: s.q + 3, r: s.r });
      return world.dispatchDraft.route as { q: number; r: number }[];
    });

    // The middle one — the case "Undo waypoint" (pop the newest) can't reach.
    await page.getByRole('button', { name: 'Remove waypoint 2' }).click();

    const route = await page.evaluate(() => (window as unknown as OverlayWindow).__demoWorld().dispatchDraft.route);
    expect(route).toEqual([plotted[0], plotted[2]]);
  });

  test('an attack draft marks its target settlement on the map', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const box = await settlement.canvasBox();

    const target = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: s.q + 3, r: s.r - 1 };
      // A rival settlement the dispatch can be aimed at — registered into
      // the local WorldModel exactly the way `refreshWorldSettlements` does
      // it in live mode.
      world.model.registerSettlement({
        id: 'rival-1',
        ownerId: 'rival-1',
        ownerName: 'Ragna',
        name: 'Skarhavn',
        q: at.q,
        r: at.r,
        level: 2,
        resources: {},
        rates: {},
        foundedAt: Date.now(),
      });
      world.startDispatch();
      return { at, screen: (window as unknown as OverlayWindow).__settlementRenderer().hexCenterScreen(at) };
    });

    const frame = () => page.evaluate(() => (window as unknown as OverlayWindow).__settlementRenderer().lastArmyOverlayFrame());
    const clip = { x: box.x + target.screen.x - 70, y: box.y + target.screen.y - 70, width: 140, height: 140 };
    // Nothing is marked while the draft is a plain Move with no target.
    expect((await frame()).targets).toEqual([]);
    const unmarked = await page.screenshot({ clip });

    await page.getByRole('button', { name: 'Attack', exact: true }).click();
    await page.evaluate(() => (window as unknown as OverlayWindow).__demoWorld().setDispatchTarget('rival-1'));

    await expect.poll(async () => (await frame()).targets.length, { timeout: 5_000 }).toBe(1);
    const marked = (await frame()).targets[0];
    expect(marked.kind).toBe('attack');
    expect(Math.hypot(marked.x - target.screen.x, marked.y - target.screen.y)).toBeLessThan(1);
    const attackShot = await page.screenshot({ clip });
    expect(Buffer.compare(unmarked, attackShot)).not.toBe(0);

    // Support gets its own, visibly different marker rather than reusing the
    // crossed sword/axe.
    await page.getByRole('button', { name: 'Support', exact: true }).click();
    await page.evaluate(() => (window as unknown as OverlayWindow).__demoWorld().setDispatchTarget('rival-1'));
    await expect.poll(async () => (await frame()).targets[0]?.kind, { timeout: 5_000 }).toBe('support');
    const supportShot = await page.screenshot({ clip });
    expect(Buffer.compare(attackShot, supportShot)).not.toBe(0);
  });

  test('an in-transit army is drawn between hexes and keeps advancing', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    // A march that started a moment ago and has half a minute to run, over
    // an intentionally uneven per-leg schedule (`cumulativeHours`) — the
    // whole point of issue #94's backend change. `position` is pinned to the
    // *last hex reached*, exactly as the backend reports it, so a renderer
    // that still snapped to `position` would sit motionless on a hex centre
    // and fail every assertion below.
    const seeded = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      const path = [
        { q: s.q, r: s.r },
        { q: s.q + 1, r: s.r },
        { q: s.q + 2, r: s.r },
        { q: s.q + 3, r: s.r },
      ];
      // Departed 8s ago on a 30s trip whose first leg (see cumulativeHours
      // below) takes 20 of those 30 — so every sample this test takes lands
      // comfortably mid-leg rather than near a hex centre by accident.
      const departedAt = new Date(Date.now() - 8_000).toISOString();
      const arrivesAt = new Date(Date.now() + 22_000).toISOString();
      world.armies = [
        {
          id: 'army-1',
          settlementId: world.selectedSettlementId,
          mission: 'move',
          targetSettlementId: null,
          atHome: false,
          supporting: false,
          position: { q: path[0].q, r: path[0].r },
          provisions: 40,
          totalSpeed: 4,
          totalUpkeepPerHour: 1,
          stacks: [{ unit: 'spearman', count: 5 }],
          movement: {
            departedAt,
            path,
            cumulativeHours: [0, 20, 25, 30],
            arrivesAt,
            returnPath: [...path].reverse(),
            returnCumulativeHours: [0, 2, 5, 6],
            turnAroundAt: arrivesAt,
            returnArrivesAt: new Date(Date.now() + 60_000).toISOString(),
            isReturning: false,
          },
        },
      ];
      world.selectArmy('army-1');
      const renderer = (window as unknown as OverlayWindow).__settlementRenderer();
      return { path, hexCentres: path.map((c) => renderer.hexCenterScreen(c)) };
    });

    const marker = async () => {
      const frame = await page.evaluate(() => (window as unknown as OverlayWindow).__settlementRenderer().lastArmyOverlayFrame());
      return frame.armies[0];
    };
    await expect.poll(async () => (await marker())?.id, { timeout: 5_000 }).toBe('army-1');

    const distanceToNearestHexCentre = (p: { x: number; y: number }) =>
      Math.min(...seeded.hexCentres.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
    // Measured against the actual on-screen hex spacing rather than a fixed
    // pixel count, so the thresholds below mean the same thing at whatever
    // zoom the settlement view happened to pick (zoomForFogMargin).
    const hexSpacing = Math.hypot(
      seeded.hexCentres[1].x - seeded.hexCentres[0].x,
      seeded.hexCentres[1].y - seeded.hexCentres[0].y,
    );
    expect(hexSpacing).toBeGreaterThan(10);

    // The concrete claim of issue #94: the marker is at a fractional point
    // *between* two hex centres, not on any of them.
    //
    // Polled rather than asserted on one arbitrary sample. The route runs
    // *through* hex centres, so a marker travelling it is legitimately within
    // 0.2 spacings of one for about two fifths of every segment — a single
    // snapshot is close to a coin flip, and which side it lands on moves with
    // however long the setup above happened to take. (That is how this surfaced:
    // the water shader made the settlement view slower to reach, and the test
    // went from passing to failing two runs in three without its own code
    // changing.) Polling asserts what the issue actually claims — that the
    // marker *is drawn* at fractional positions — which one good sample proves
    // and no sampling phase can defeat.
    let first = await marker();
    await expect
      .poll(
        async () => {
          first = await marker();
          return distanceToNearestHexCentre(first);
        },
        { timeout: 5_000 },
      )
      .toBeGreaterThan(hexSpacing * 0.2);
    expect(first.interpolated).toBe(true);

    // ...and it keeps moving between polls, with nothing re-fetched (demo
    // mode has no backend): the interpolation itself is what advances it.
    await page.waitForTimeout(3_000);
    const second = await marker();
    expect(second.interpolated).toBe(true);
    const travelledFirst = Math.hypot(first.x - seeded.hexCentres[0].x, first.y - seeded.hexCentres[0].y);
    const travelledSecond = Math.hypot(second.x - seeded.hexCentres[0].x, second.y - seeded.hexCentres[0].y);
    expect(travelledSecond).toBeGreaterThan(travelledFirst + hexSpacing * 0.02);
    // No between-hexes assertion on this second sample. It is the same coin
    // flip as above with no way to re-roll it — this sample has to be the one
    // taken 3s after the first, or "it kept moving" means nothing — and it adds
    // nothing: `onSegment` below pins the marker to within a pixel of a route
    // segment, which is a stronger statement about fractional positioning than
    // "not near a centre" is.

    // The marker stays on the route it is travelling: the point must lie on
    // one of the path's own segments (within a pixel), not merely somewhere
    // between two hexes.
    const onSegment = seeded.hexCentres.slice(0, -1).some((a, i) => {
      const b = seeded.hexCentres[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const t = ((second.x - a.x) * (b.x - a.x) + (second.y - a.y) * (b.y - a.y)) / (len * len);
      if (t < 0 || t > 1) return false;
      const projected = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return Math.hypot(second.x - projected.x, second.y - projected.y) < 1;
    });
    expect(onSegment).toBe(true);
  });

  test('an army standing at home stays on its settlement hex', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    const home = await page.evaluate(() => {
      const world = (window as unknown as OverlayWindow).__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      world.armies = [
        {
          id: 'garrison-1',
          settlementId: world.selectedSettlementId,
          mission: 'move',
          targetSettlementId: null,
          atHome: true,
          supporting: false,
          position: { q: s.q, r: s.r },
          provisions: 0,
          totalSpeed: 4,
          totalUpkeepPerHour: 1,
          stacks: [{ unit: 'spearman', count: 2 }],
          movement: null,
        },
      ];
      return (window as unknown as OverlayWindow).__settlementRenderer().hexCenterScreen({ q: s.q, r: s.r });
    });

    const marker = async () => {
      const frame = await page.evaluate(() => (window as unknown as OverlayWindow).__settlementRenderer().lastArmyOverlayFrame());
      return frame.armies[0];
    };
    await expect.poll(async () => (await marker())?.id, { timeout: 5_000 }).toBe('garrison-1');

    const first = await marker();
    expect(first.interpolated).toBe(false);
    expect(Math.hypot(first.x - home.x, first.y - home.y)).toBeLessThan(1);

    // Still there a couple of seconds later — a stationary army must not be
    // dragged along by the interpolation meant for a marching one.
    await page.waitForTimeout(1_500);
    const later = await marker();
    expect(Math.hypot(later.x - home.x, later.y - home.y)).toBeLessThan(1);
  });
});

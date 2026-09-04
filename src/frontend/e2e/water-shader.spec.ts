// Guards the water shader (docs/design/water-shader.md) actually drawing, and
// drawing where §3 says it may.
//
// The unit tests cover the parts that are functions: the mask's layout and its
// distance field (waterMask.test.ts, waterMaskLayout.test.ts) and the stack
// order (worldLayerOrder). None of them can tell you that the mesh reached the
// screen. A GLSL compile failure does not throw — it surfaces only as a console
// message — so a shader that draws nothing at all passes every test in the repo
// and looks exactly like a shader whose effects are subtle. That is the gap this
// closes, in the same way fog-drift.spec.ts closes it for the fog: by looking at
// pixels across a flag change and across time.
//
// Two claims, and they are chosen to be the two that a screenshot cannot fake:
//
//   1. **It draws on the sea, and does not run inland.** §3.5 is the awkward
//      one: in the settlement view the foam's land-side bleed is *not* clipped
//      by geometry (the sand it paints over is in `terrainBase`, below the
//      mesh), so how far the band runs onto the land is a visible art parameter
//      rather than a free safety margin — and nothing but this stops it growing.
//
//      Both halves were checked by breaking the code rather than by reasoning
//      about it. Setting FOAM_LAND_REACH to 8.0 moves 96% of the inland patch
//      and fails the test; a displaced mask does *not*, because in this view the
//      land art sits above the mesh and hides it, so this is a claim about the
//      foam's reach specifically and not a general "the shader stays off the
//      island". Worth knowing before trusting it for the latter.
//
//      A third patch on a coastal hex — "the foam does touch the beach" —
//      was tried and removed. At the shipped constants the land-side bleed is
//      0.12 of a 0.3-hex band, about four pixels at the hex's edge: a patch at
//      the hex centre cannot see it (setting the reach to 0.0 changed nothing
//      there), and one that could would straddle the coastline and be measuring
//      the water. It is a real effect that this kind of test cannot reach.
//   2. **It keeps moving at rest.** The whole surface is animated by one time
//      uniform. If that stops ticking, every frame is a valid-looking still.
//
// The mirror image of fog-drift.spec.ts, deliberately: that test turns the water
// off to measure only the fog, this one turns the fog's drift off to measure only
// the water. Neither can prop the other up, which is the property that test's
// header asks for and did not get until the water arrived.
import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';

declare global {
  interface Window {
    __waterDebug: { water: boolean };
    __fogDebug: { drift: boolean; maskUnknown: boolean; maskOutOfSight: boolean; terrainCull: boolean };
  }
}

/** A screen-space box centred on a hex, small enough to stay inside it. */
interface Patch {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fraction of pixels that differ between two PNGs by more than 8/765 summed
 * over RGB — the same threshold and the same reason as fog-drift.spec.ts's:
 * comfortably above 8-bit rounding noise, far below a real change.
 */
async function movedPct(page: import('@playwright/test').Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [x, y] = await Promise.all([decode(first), decode(second)]);
      let moved = 0;
      for (let i = 0; i < x.length; i += 4) {
        const delta = Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
        if (delta > 8) moved++;
      }
      return (100 * moved) / (x.length / 4);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

/**
 * Reveals the map the shader draws on.
 *
 * Not a test-environment shortcut — these are the same three debug flags
 * scripts/screenshot-helpers/water-shots.mjs sets for every shot of this
 * feature, and for the same reason: at the shipped flags the water sits under
 * two fog quads (§3.2), so most of the sea is behind mist and a change to it is
 * invisible to a camera. Terrain culling goes with them, or the islands the mask
 * still knows about vanish and leave bare foam rings on open water.
 */
async function revealTheSea(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    Object.assign(window.__fogDebug, { maskUnknown: false, maskOutOfSight: false, terrainCull: false });
  });
  await page.waitForTimeout(500);
}

/**
 * A hex that is sea (or is land) with two full rings of the same around it,
 * returned as a small screen-space box at its centre.
 *
 * Two rings, not one, and this is the load-bearing part of the land half of the
 * test. The foam is *meant* to lick onto the beach (§3.5) and the mask's own
 * filtering reaches a texel past the coast, so a land hex merely adjacent to the
 * sea legitimately changes when the layer is toggled. Requiring the whole
 * two-ring neighbourhood puts the patch further from any coastline than the foam
 * can reach at any surge, which makes "nothing changed" a claim about the mask
 * rather than about luck.
 *
 * "Land" rather than a named terrain, because these islands are small and
 * mixed: an inland hex is grass or forest with a sand rim two rings out, so
 * demanding two rings of one terrain finds nothing on a seven-hex island. What
 * the shader cares about is the sea/land split the mask encodes, and that is
 * what this asks for.
 */
async function patchDeepInside(
  page: import('@playwright/test').Page,
  want: 'sea' | 'land',
  half: number,
): Promise<Patch> {
  const box = (await page.locator('canvas').boundingBox())!;
  const centre = await page.evaluate(
    ([wanted, margin, viewport]) => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const renderer = win.__settlementRenderer();

      const isWanted = (q: number, r: number) => {
        const terrain = world.model.getTile(q, r)?.terrain;
        if (!terrain) return false;
        return wanted === 'sea' ? terrain === 'sea' : terrain !== 'sea';
      };
      // Every hex within 2 of this one, itself included — 19 of them.
      const neighbourhoodIsWanted = (q: number, r: number) => {
        for (let dq = -2; dq <= 2; dq++) {
          for (let dr = -2; dr <= 2; dr++) {
            if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > 2) continue;
            if (!isWanted(q + dq, r + dr)) return null;
          }
        }
        return true;
      };

      // Spiral out from the settlement so the hex found is the closest one that
      // qualifies, which is the one most likely to be comfortably on screen.
      for (let ring = 0; ring <= 12; ring++) {
        for (let dq = -ring; dq <= ring; dq++) {
          for (let dr = -ring; dr <= ring; dr++) {
            if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 !== ring) continue;
            const at = { q: settlement.q + dq, r: settlement.r + dr };
            if (!neighbourhoodIsWanted(at.q, at.r)) continue;
            const screen = renderer.hexCenterScreen(at);
            // On screen with the whole patch inside the canvas, or it is not a
            // sample of anything.
            if (
              screen.x > margin &&
              screen.y > margin &&
              screen.x < viewport.width - margin &&
              screen.y < viewport.height - margin
            ) {
              return screen;
            }
          }
        }
      }
      return null;
    },
    [want, half + 2, { width: box.width, height: box.height }] as const,
  );

  if (!centre) throw new Error(`no on-screen ${want} hex with two clear rings around it`);
  return { x: box.x + centre.x - half, y: box.y + centre.y - half, width: half * 2, height: half * 2 };
}

/**
 * Half-width of the sampled patches, in px. Small enough to sit inside one hex
 * at the settlement zoom (a hex is ~110px wide there), which is what lets the
 * land patch be a statement about that hex rather than about its surroundings.
 */
const PATCH_HALF = 22;

// @g1, which is not where its sibling fog-drift.spec.ts lives. The tags are a
// shard assignment, not a grouping: on the run this was written against the
// four e2e jobs took 7m17 (g1), 9m28 (g2), 8m27 (g3) and 7m44 (rest), and two
// more settlement specs land on whichever shard takes them. g1 was the shortest.
test.describe('water shader', { tag: '@g1' }, () => {
  test('draws on the sea and leaves the land alone', async ({ page }) => {
    // foundSettlement() plus a real PixiJS mount, then several screenshots of a
    // continuously animating canvas — see budgets.ts.
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await foundSettlement(page);
    await revealTheSea(page);

    const sea = await patchDeepInside(page, 'sea', PATCH_HALF);
    const inland = await patchDeepInside(page, 'land', PATCH_HALF);

    const shoot = async () => ({
      sea: await page.screenshot({ clip: sea }),
      inland: await page.screenshot({ clip: inland }),
    });
    const withWater = await shoot();

    await page.evaluate(() => {
      window.__waterDebug.water = false;
    });
    await page.waitForTimeout(600);

    const without = await shoot();

    // With the layer gone this view is a still image — the fog's two quads are
    // off (revealTheSea) and nothing else in a settlement animates at rest.
    // Asserted rather than assumed, because it is what makes both comparisons
    // below attributable: if the off state is static, then every pixel that
    // differs between an on-frame and an off-frame differs *because of the
    // layer*, whichever instant of the caustics' drift the on-frame caught.
    await page.waitForTimeout(700);
    expect(await movedPct(page, without.sea, await page.screenshot({ clip: sea }))).toBe(0);

    // The sea patch: the layer is the only thing that can have changed it, so a
    // real share of it must have.
    //
    // 5%, not the 20% this started at, and the reason is worth stating because
    // it looks like a weakened assertion. In a *settlement* the shader draws no
    // sea body at all — the painted water tiles are the sea body there (§4.1) —
    // so what lands on open water is the caustic nets and the pools over them,
    // and those cover the water rather than filling it: §4.2e measured the lit
    // fraction at 16-19%, breathing by a few points. Two runs of this test over
    // two different sampled hexes gave 14.7% and >20%. A floor at the middle of
    // that range is a coin flip; a dead shader, a failed GLSL compile or a mesh
    // that never reached the stage all give zero.
    expect(await movedPct(page, withWater.sea, without.sea)).toBeGreaterThan(5);

    // Two rings inland: exactly zero. Not "a small number" — the land-side reach
    // is 0.12 of the foam's width, about a tenth of a hex, so anything at all
    // this far in means it has grown by an order of magnitude — measured, 8.0
    // moves 96% of this patch. A tolerance here is a tolerance for exactly that.
    expect(await movedPct(page, withWater.inland, without.inland)).toBe(0);
  });

  test('keeps animating while the camera sits still', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await foundSettlement(page);
    await revealTheSea(page);

    // The fog is the other thing in this view that animates at rest, so its
    // drift comes off — the mirror of what fog-drift.spec.ts does to the water.
    // Without this the "water off" half below would measure the fog and pass
    // whatever the shader did.
    await page.evaluate(() => {
      window.__fogDebug.drift = false;
    });
    await page.waitForTimeout(500);

    const sea = await patchDeepInside(page, 'sea', PATCH_HALF);

    const before = await page.screenshot({ clip: sea });
    await page.waitForTimeout(2_000);
    const after = await page.screenshot({ clip: sea });
    // Two seconds is several caustic band-widths of drift and most of a foam
    // surge; 3% is the same floor fog-drift.spec.ts uses against the same kind
    // of "it technically animates" regression.
    expect(await movedPct(page, before, after)).toBeGreaterThan(3);

    await page.evaluate(() => {
      window.__waterDebug.water = false;
    });
    await page.waitForTimeout(600);

    const frozenFrom = await page.screenshot({ clip: sea });
    await page.waitForTimeout(2_000);
    const frozenTo = await page.screenshot({ clip: sea });
    // With the layer gone and the fog frozen this view is a still image. This is
    // what makes the assertion above a statement about the *water* rather than
    // about anything on screen happening to move.
    expect(await movedPct(page, frozenFrom, frozenTo)).toBe(0);
  });
});

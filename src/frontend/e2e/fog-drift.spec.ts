// Guards the fog's wind drift (docs/design/map-fog-v2.md §2.4) actually
// animating on screen.
//
// This is a real, shipped-for-a-while regression and not a hypothetical:
// the drift uniform was ticking every frame the whole time, and the debug
// toggle for it was wired up correctly — but it drove a UV warp whose
// amplitude (0.006 UV, against a ramp ~0.2 UV wide) changed the fog's
// opacity by ~4%, translating at about one hex per 30 seconds. Every unit
// and integration test you could write about the uniform passed. Only
// looking at consecutive frames catches it, which is what this does.
//
// The camera is deliberately left untouched between frames, so that any pixel
// that changes is the fog. The `drift: false` half of the test is what makes
// that claim measurable rather than assumed — it must come out at exactly
// zero, and if some other idle animation is ever added to this view it will
// fail there first and loudly, instead of quietly propping up the on/off
// comparison above.
//
// That is exactly what happened: the water shader
// (docs/design/water-shader.md) put a second, permanently animating layer in
// this view — caustics drifting, foam surging — and the frozen half came out
// at 29% moved instead of 0. The mechanism worked as designed, so the fix is
// the one it was pointing at: this test turns the water off and goes back to
// measuring only the fog.
//
// Note that it has to be off for *both* halves, not just the frozen one. The
// drifted half asserts that something moved, and a layer that always moves
// would satisfy it whatever the fog did — the "quietly propping up" failure
// this comment warned about.
import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';

/** Fraction of pixels differing by more than `threshold` summed over RGB, and the largest such difference. */
async function frameDelta(
  page: import('@playwright/test').Page,
  a: Buffer,
  b: Buffer,
): Promise<{ movedPct: number; maxDelta: number }> {
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
      let maxDelta = 0;
      for (let i = 0; i < x.length; i += 4) {
        const delta = Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
        if (delta > maxDelta) maxDelta = delta;
        // 8/765 is comfortably above 8-bit rounding noise but far below a
        // real change in fog opacity at the vision edge.
        if (delta > 8) moved++;
      }
      return { movedPct: (100 * moved) / (x.length / 4), maxDelta };
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

test.describe('fog wind drift', { tag: '@g3' }, () => {
  test('the vision edge keeps moving at rest, and freezes when drift is off', async ({ page }) => {
    // foundSettlement() alone (page load + a real PixiJS/texture mount) can
    // already run close to the global 45s budget under software-rendered
    // headless Chromium, and this test then sits still for several seconds
    // on purpose — the thing under test is elapsed time.
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await foundSettlement(page);

    // The only other thing in this view that animates at rest — see the note
    // at the top of the file. Off, so both halves below measure the fog.
    await page.evaluate(() => {
      window.__waterDebug.water = false;
    });
    await page.waitForTimeout(500);

    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    // A band around the settlement wide enough to contain the whole vision
    // edge at the level-1 camera zoom (zoomForFogMargin), which is the only
    // part of the frame the fog is allowed to be shaping at all.
    const clip = {
      x: box.x + box.width * 0.1,
      y: box.y + box.height * 0.1,
      width: box.width * 0.8,
      height: box.height * 0.8,
    };

    const driftedFrom = await page.screenshot({ clip });
    await page.waitForTimeout(2_000);
    const driftedTo = await page.screenshot({ clip });

    const drifted = await frameDelta(page, driftedFrom, driftedTo);
    // The pre-fix shader managed 0.31% here over the same two seconds, and
    // was reported as "not animating at all" from looking at it. 3% is well
    // clear of that and well under the ~18% the current constants produce,
    // so this fails on a regression toward imperceptible without being
    // brittle about the exact amplitude.
    expect(drifted.movedPct).toBeGreaterThan(3);
    expect(drifted.maxDelta).toBeGreaterThan(64);

    await page.evaluate(() => {
      window.__fogDebug.drift = false;
    });
    // One frame for the flag to take effect before the baseline is taken.
    await page.waitForTimeout(500);

    const frozenFrom = await page.screenshot({ clip });
    await page.waitForTimeout(2_000);
    const frozenTo = await page.screenshot({ clip });

    const frozen = await frameDelta(page, frozenFrom, frozenTo);
    expect(frozen.movedPct).toBe(0);
    expect(frozen.maxDelta).toBe(0);
  });
});

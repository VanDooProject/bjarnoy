// Guards the fog's dark tier greying the world map's open sea while the camera is being panned.
//
// The sea is drawn by the renderer itself (SeaBackdrop, seaBackdrop.ts) inside the subtree the dark tier's filter greys.
// It used to be a CSS gradient behind a transparent canvas, and the water mesh only covers the last baked water-mask rect:
// during a pan the bake is deferred (waterMaskDirty), so large parts of the screen were outside the mesh and the filter
// had only transparent pixels there, where all it can do is add a dark tint. The CSS teal stayed saturated instead of
// going grey. Holding the drag keeps that gap open for as long as the test needs.
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { foundSettlement, gotoWorldMap } from './helpers';
import { captureCanvas, waitForRenderedFrames } from './support/render';

/** Median of (max(r,g,b) - min(r,g,b)) over the PNG's pixels: 0 is grey, a saturated teal is far above. */
async function medianChroma(page: import('@playwright/test').Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const chroma: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      chroma.push(Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
    }
    chroma.sort((a, b) => a - b);
    return chroma[Math.floor(chroma.length / 2)];
  }, png.toString('base64'));
}

test.describe('fog dark tier', { tag: '@g1' }, () => {
  test('greys the open sea outside the baked water rect while a pan is held', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await foundSettlement(page);
    await gotoWorldMap(page);
    await page.getByRole('button', { name: 'Later' }).click({ timeout: 2_000 }).catch(() => {});

    // Only the never-scouted white mist goes off (FogDebugPanel's own switches): the demo world has almost no explored
    // ground, so the mist would otherwise hide the dark tier this spec is about.
    await page.evaluate(() => {
      window.__fogDebug.maskUnknown = false;
      window.__fogDebug.terrainCull = false;
    });

    // Zoom far out (about 0.14) so the water mask rect covers little of the screen.
    await page.mouse.move(640, 400);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 100);
      await page.keyboard.up('Control');
      await page.waitForTimeout(30);
    }
    await waitForRenderedFrames(page);

    // Hold a drag: the bake is deferred while dragging, so the gap exists for as long as the button is down.
    await page.mouse.move(850, 480);
    await page.mouse.down();
    try {
      await page.mouse.move(100, 130, { steps: 10 });
      await expect
        .poll(() => page.evaluate(() => (window.__settlementRenderer() as unknown as { waterMaskDirty: boolean }).waterMaskDirty))
        .toBe(true);
      await waitForRenderedFrames(page, 2);

      // Open sea at the bottom right, clear of the Armies panel and the HUD.
      const shot = await captureCanvas(page, { x: 640, y: 300, width: 300, height: 220 });
      expect(await medianChroma(page, shot)).toBeLessThan(CHROMA_LIMIT);
    } finally {
      await page.mouse.up();
    }
  });
});

/** Measured median chroma: 16 with the sea in the canvas (greyed by the dark tier), 54 with the old CSS backdrop. */
const CHROMA_LIMIT = 30;

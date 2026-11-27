import { expect, type Page } from '@playwright/test';
import { cdpSessionFor } from './cdp';
import { whenFrameRendered } from './renderer';

/**
 * Waits for the map container's own mount-complete signal (`data-map-ready`,
 * set by useHexMapRenderer once HexMapRenderer.mount() resolves) plus one
 * real painted frame past it, instead of a guessed sleep — used by every
 * test that navigates to a view with a HexMapRenderer canvas (landing,
 * settlement, world) before interacting with it.
 */
export async function waitForMapReady(page: Page): Promise<void> {
  await page.locator('.map-container[data-map-ready]').waitFor({ timeout: 15_000 });
  // MapStatusOverlay swallows pointer events while it is up (loading steps,
  // e.g. waiting for the fog mask) — raw page.mouse calls don't auto-wait on
  // actionability, so wait for it to be gone before interacting.
  await page.locator('[data-testid="map-status-overlay"]').waitFor({ state: 'detached', timeout: 15_000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
  );
}

/**
 * Waits until the settlement renderer (`window.__settlementRenderer`) has run
 * `frames` more frames of its render loop than when this was called.
 *
 * For a spec that changes something and then looks at the canvas: the loop is
 * paced on a device whose frames are expensive (framePacing.ts) and can drop
 * to about a frame a second on a busy software-rendered runner, so a fixed
 * `waitForTimeout` can end before the change was drawn at all, and a
 * `requestAnimationFrame` wait counts browser frames the paced loop skips.
 * Two frames by default: the one that may already be under way when the
 * change landed, and one that started after it.
 */
export async function waitForRenderedFrames(page: Page, frames = 2): Promise<void> {
  const read = () =>
    page.evaluate(
      () => window.__settlementRenderer().renderedFrames,
    );
  const start = await read();
  await expect.poll(read, { message: `the map never drew ${frames} more frames`, intervals: [100] }).toBeGreaterThanOrEqual(start + frames);
}

/**
 * A raw frame of the map canvas, for `Buffer.compare` against a later one.
 *
 * Same idea (and the same root cause) as `rectsOf` above: on a software-
 * rendered runner this app's frames take hundreds of milliseconds, and any
 * Playwright API that waits out animation frames pays that price several
 * times over. `locator.screenshot()` is the worst of them — before it
 * captures anything it scrolls the element into view and waits for its box
 * to hold still across consecutive rAFs, so its cost is *frame-rate bound*
 * rather than proportional to the pixels involved. Measured against this
 * view (world map, fog off), at 3 fps under CPU throttling and at the ~4 fps
 * GitHub's 2-vCPU runner manages:
 *
 *   locator.screenshot() .............. 8.2s throttled / 5.07s on CI
 *   page.screenshot({ clip }) ......... 2.9s throttled
 *   Page.captureScreenshot (this) ..... 0.7s throttled
 *
 * 5.07s is what made `world-map-interactions.spec.ts`'s hover test fail on
 * CI: its `expect.poll` has a 5s budget, and a single screenshot ate all of
 * it before the predicate could return even once — a timeout that said
 * nothing about the highlight it was polling for, which the same run's
 * diagnostics showed rendering perfectly well. Going through CDP directly
 * skips the waiting (there is nothing to wait for: the canvas is a
 * fixed, viewport-filling element that never moves) and captures exactly
 * the same pixels.
 *
 * It does wait for one thing: the next frame the map renderer draws (see the
 * comment in the body), which is what makes a shot taken right after an
 * input or a state change show that change.
 */
export async function captureCanvas(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  // Wait for the renderer to draw a frame that started after this call. The
  // render loop is paced (framePacing.ts) and runs at a frame a second or
  // less on a busy software-rendered runner, while CDP captures whatever the
  // canvas last drew: a shot taken right after a pan or a model change can
  // still show the frame from before it, so a before/after compare came out
  // identical although the camera had moved.
  await whenFrameRendered(page);
  const { data } = await (await cdpSessionFor(page)).send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
  });
  return Buffer.from(data, 'base64');
}

/** Starts recording main-thread long tasks (durations in ms) from now on; read the worst one with `longestTask`. */
export async function observeLongTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as { __longTasks: number[] };
    win.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) win.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
}

/** The longest main-thread task (ms) since `observeLongTasks`, 0 when none was long. */
export function longestTask(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, ...(window as unknown as { __longTasks: number[] }).__longTasks));
}

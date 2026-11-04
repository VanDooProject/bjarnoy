import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';

// Beat lengths live in the beats (src/intro/beats/*Beat.vue meta) and change with the art, so the spec doesn't copy
// them: it runs the frozen clock in 1 s steps until the intro shows what it waits for. The sequencer is
// setTimeout-based, and `fastForward` fires at most one due timer per call, hence the steps.
const STEP_MS = 1000;
const MAX_FAKE_MS = 60_000;

// Same wait as helpers.ts's waitForMapReady: the terrain/building atlases are a real download and decode.
const TILES_LOADED = { timeout: 15_000 };

const intro = (page: Page) => page.getByTestId('landing-intro');
const skip = (page: Page) => page.getByTestId('intro-skip');

/** Delays (never aborts: an aborted request is a console error) the tile atlas pages until `release()`. */
async function holdAtlases(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const hold = async (route: Route) => {
    await held;
    await route.continue();
  };
  await page.route(/\/terrain-\d+[^/]*\.webp/, hold);
  await page.route(/\/buildings-[a-z0-9-]*\d+[^/]*\.webp/, hold);
  return release;
}

/** Runs the fake clock for `ms` in steps (the intro must not move on its own in that time). */
async function runFake(page: Page, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += STEP_MS) await page.clock.fastForward(STEP_MS);
}

/** Runs the fake clock until the intro shows `beat`, or until it is gone when `beat` is null. */
async function advanceTo(page: Page, beat: string | null): Promise<void> {
  for (let t = 0; t <= MAX_FAKE_MS; t += STEP_MS) {
    const shown = await page.evaluate(
      () => document.querySelector('[data-testid="landing-intro"]')?.getAttribute('data-beat') ?? null,
    );
    if (shown === beat) return;
    await page.clock.fastForward(STEP_MS);
  }
  throw new Error(`intro never reached ${beat ?? 'its end'} within ${MAX_FAKE_MS} ms of fake time`);
}

/**
 * Freezes the page's clock at 1 s of fake time from before the app boots, so the beats only move when the test
 * runs the clock (real time, e.g. the tile download on a slow runner, cannot advance them).
 */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
}

/** Records every data-beat / data-phase the intro root shows, in order, from before the app boots. */
async function recordIntro(page: Page): Promise<() => Promise<{ beats: string[]; phases: string[] }>> {
  await page.addInitScript(() => {
    const log = { beats: [] as string[], phases: [] as string[] };
    (window as unknown as { __introLog: typeof log }).__introLog = log;
    const push = (list: string[], value: string | null) => {
      if (value && list[list.length - 1] !== value) list.push(value);
    };
    const read = () => {
      const root = document.querySelector('[data-testid="landing-intro"]');
      if (!root) return;
      push(log.beats, root.getAttribute('data-beat'));
      push(log.phases, root.getAttribute('data-phase'));
    };
    new MutationObserver(read).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-beat', 'data-phase'] });
  });
  return () => page.evaluate(() => (window as unknown as { __introLog: { beats: string[]; phases: string[] } }).__introLog);
}

test.describe('landing intro', { tag: '@g3' }, () => {
  // Motion on: the suite emulates the OS reduced-motion preference, which the 'auto' menu-animations setting follows.
  test.describe('with motion', () => {
    test.use({ mapMotion: { hud: 'on' } });

    test('skip shows only once the tiles are loaded, and pressing it starts the exit', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');

      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await expect(skip(page)).toBeHidden();
      await advanceTo(page, 'prophecy');
      await expect(skip(page)).toBeHidden();

      release();
      await expect(skip(page)).toBeVisible(TILES_LOADED);
      await skip(page).click();
      await expect(intro(page)).toHaveAttribute('data-phase', 'exiting');
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
      await advanceTo(page, null);
      await expect(intro(page)).toHaveCount(0);
      await expect(page.locator('canvas')).toBeVisible();
    });

    test('the hold loops while the tiles load, then the exit hands over to the map', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');

      await advanceTo(page, 'hold');
      await runFake(page, 30_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'hold');
      await expect(skip(page)).toBeHidden();

      // Past the hold line's reading time, loaded tiles start the exit on their own.
      release();
      await expect(intro(page)).toHaveAttribute('data-phase', 'exiting', TILES_LOADED);
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
      await advanceTo(page, null);
      await expect(page.locator('canvas')).toBeVisible();
    });

    test('the optional ravens beat is dropped once the tiles are loaded, and the exit follows the last intro beat', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const log = await recordIntro(page);
      await page.goto('/#intro');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      // Tiles finish while the fire plays; the clock only moves when the test moves it.
      await expect(skip(page)).toBeVisible(TILES_LOADED);

      await advanceTo(page, 'landfall');
      await advanceTo(page, null);

      expect((await log()).beats).toEqual(['fire', 'prophecy', 'sending', 'landfall']);
    });

    test('pause freezes the intro, resume lets it go on', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      const pause = page.getByTestId('intro-pause');
      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await runFake(page, 20_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
      await advanceTo(page, 'prophecy');
      release();
    });

    test('#loop(1,6) plays the first and the last beat again and again, and the intro never goes away', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const log = await recordIntro(page);
      await page.goto('/#loop(1,6)');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await advanceTo(page, 'landfall');
      await advanceTo(page, 'fire');
      await advanceTo(page, 'landfall');
      await advanceTo(page, 'fire');

      expect((await log()).beats).toEqual(['fire', 'landfall', 'fire', 'landfall', 'fire']);
      await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
    });
  });

  test.describe('with reduced motion', () => {
    test('shows the first frame and a play button; pressing play runs the sequence', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');

      await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await expect(page.getByTestId('intro-play')).toBeVisible();
      await runFake(page, 20_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await page.getByTestId('intro-play').click();
      await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
      await page.clock.runFor(700); // lets the play button's leave transition finish
      await expect(page.getByTestId('intro-play')).toHaveCount(0);
      await advanceTo(page, 'prophecy');
      release();
    });

    test('goes straight to the map when the tiles load before play is pressed', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const release = await holdAtlases(page);
      const log = await recordIntro(page);
      await page.goto('/#intro');
      await expect(page.getByTestId('intro-play')).toBeVisible();

      release();
      await expect(intro(page)).toHaveCount(0, TILES_LOADED);
      await expect(page.locator('canvas')).toBeVisible();
      expect((await log()).phases).toEqual(['waitingForPlay']);
    });
  });

  test.describe('replay', () => {
    test.use({ mapMotion: { hud: 'on' } });

    test('skip shows from the start; the end screen leads back to the docs or into the game', async ({ page }) => {
      await freezeClock(page);
      const log = await recordIntro(page);
      await page.goto('/docs/saga/replay');
      await expect(skip(page)).toBeVisible();

      // Play through every beat (ravens included, one hold cycle), no load gating.
      await advanceTo(page, 'landfall');
      // The replay keeps the intro mounted for its white end screen.
      await runFake(page, 10_000);
      await expect(page.getByTestId('intro-end')).toBeVisible();
      expect((await log()).beats).toEqual(['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall']);
      await expect(page.getByTestId('intro-back-to-docs')).toBeVisible();
      await expect(page.getByTestId('intro-enter-game')).toBeVisible();
      await page.getByTestId('intro-back-to-docs').click();
      await expect(page).toHaveURL(/\/docs\/saga$/);

      // Second run, via skip, into the game.
      await page.goto('/docs/saga/replay');
      await skip(page).click();
      await runFake(page, 10_000);
      await expect(page.getByTestId('intro-end')).toBeVisible();
      await page.getByTestId('intro-enter-game').click();
      await expect(page).toHaveURL(/\/(#.*)?$/);
      expect(new URL(page.url()).pathname).toBe('/');
    });
  });

  for (const viewport of [
    { name: 'portrait', width: 390, height: 844 },
    { name: 'landscape', width: 1440, height: 900 },
  ]) {
    test(`${viewport.name}: the intro covers the viewport and keeps skip and narration 16px inside`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/docs/saga/replay');
      await expect(skip(page)).toBeVisible();
      await expect(page.getByTestId('intro-narration')).toBeVisible();

      const rects = await page.evaluate(() => {
        const rect = (id: string) => {
          const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        return { root: rect('landing-intro'), skip: rect('intro-skip'), narration: rect('intro-narration'), vw: window.innerWidth, vh: window.innerHeight };
      });
      expect(rects.root).toEqual({ left: 0, top: 0, right: rects.vw, bottom: rects.vh });
      for (const key of ['skip', 'narration'] as const) {
        const r = rects[key];
        expect(r.left, key).toBeGreaterThanOrEqual(16);
        expect(r.top, key).toBeGreaterThanOrEqual(16);
        expect(rects.vw - r.right, key).toBeGreaterThanOrEqual(16);
        expect(rects.vh - r.bottom, key).toBeGreaterThanOrEqual(16);
      }
    });
  }

  test('#no-intro never mounts the intro', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/#no-intro');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });
});

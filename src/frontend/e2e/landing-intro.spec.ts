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
const IDENTITY = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;
const landingPage = (page: Page) => page.getByTestId('landing-page');
const mapButton = (page: Page) => page.getByTestId('landing-map');

/** The landing page waits for the player: this starts the saga, with sound ("Hear the saga") or without ("or play it muted"). */
async function startSaga(page: Page, how: 'hear' | 'muted' = 'hear'): Promise<void> {
  await page.getByTestId(how === 'hear' ? 'landing-hear' : 'landing-muted').click();
  await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
}

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

/** Keeps every media element the page plays, so a spec can read a clip's muted / paused / currentTime. */
async function recordAudio(page: Page): Promise<(name: string) => Promise<{ muted: boolean; paused: boolean; currentTime: number } | null>> {
  await page.addInitScript(() => {
    const seen: HTMLMediaElement[] = [];
    (window as unknown as { __clips: HTMLMediaElement[] }).__clips = seen;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!seen.includes(this)) seen.push(this);
      return play.call(this);
    };
  });
  return (name) =>
    page.evaluate((n) => {
      const el = (window as unknown as { __clips: HTMLMediaElement[] }).__clips.find((a) => a.src.includes(n));
      return el ? { muted: el.muted, paused: el.paused, currentTime: el.currentTime } : null;
    }, name);
}

const sound = (page: Page) => page.getByTestId('intro-sound');
const animationName = (page: Page) => sound(page).evaluate((el) => getComputedStyle(el).animationName);

test.describe('landing intro', { tag: '@g3' }, () => {
  // Motion on: the suite emulates the OS reduced-motion preference, which the 'auto' menu-animations setting follows.
  test.describe('with motion', () => {
    test.use({ mapMotion: { hud: 'on' } });

    test('skip shows only once the tiles are loaded, and pressing it starts the exit', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page);

      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await expect(skip(page)).toBeHidden();
      await advanceTo(page, 'prophecy');
      await expect(skip(page)).toBeHidden();
      const pauseBefore = await page.getByTestId('intro-pause').boundingBox();

      release();
      await expect(skip(page)).toBeVisible(TILES_LOADED);
      // skip sits above the control row, so the pause button stays where it was
      expect(await page.getByTestId('intro-pause').boundingBox()).toEqual(pauseBefore);
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
      await startSaga(page);

      await advanceTo(page, 'hold');
      await runFake(page, 30_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'hold');
      await expect(skip(page)).toBeHidden();

      // Past the hold clip's length, loaded tiles start the exit on their own.
      release();
      await expect(intro(page)).toHaveAttribute('data-phase', 'exiting', TILES_LOADED);
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
      await advanceTo(page, null);
      await expect(page.locator('canvas')).toBeVisible();
    });

    test('with the tiles loaded early, every beat still plays: the ravens and the hold before the exit', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const log = await recordIntro(page);
      await page.goto('/#intro');
      await startSaga(page);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      // Tiles finish while the fire plays; the clock only moves when the test moves it.
      await expect(skip(page)).toBeVisible(TILES_LOADED);

      await advanceTo(page, 'landfall');
      await advanceTo(page, null);

      expect((await log()).beats).toEqual(['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall']);
    });

    test('pause freezes the intro, resume lets it go on', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page);
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

    test('Esc closes the intro at once, with no exit beat, and the map is there', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      const log = await recordIntro(page);
      await page.goto('/#intro');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await page.keyboard.press('Escape');
      await expect(intro(page)).toHaveCount(0);
      await expect(page.locator('#landing-intro')).toHaveCount(0);
      release();
      await expect(page.locator('canvas')).toBeVisible();
      expect((await log()).phases).not.toContain('exiting');
    });

    test('the Log in button closes the intro and opens the login page', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await page.getByTestId('intro-login').click();
      await expect(intro(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/login$/);
      release();
    });

    test('#loop: Esc closes the loop and shows the map', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      await page.goto('/#loop');
      await expect(intro(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(intro(page)).toHaveCount(0);
      await expect(page.locator('canvas')).toBeVisible();
    });

    test('the Play intro button shows once the intro is gone, hides while it plays, and plays it again', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      await page.goto('/#intro');
      const playIntro = page.getByTestId('play-intro');
      await expect(intro(page)).toBeVisible();
      await expect(playIntro).toHaveCount(0);

      await page.keyboard.press('Escape');
      await expect(intro(page)).toHaveCount(0);
      await expect(playIntro).toBeVisible();

      await playIntro.click();
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      // the button fades out (600 ms) on the frozen clock: pause the intro and let the clock run for the fade
      await page.getByTestId('intro-pause').click();
      await runFake(page, 3000);
      await expect(playIntro).toHaveCount(0);
      await page.getByTestId('intro-pause').click();
      // the tiles are loaded already: skip is there at once and hands back to the landing page
      await expect(skip(page)).toBeVisible();
      await skip(page).click();
      await advanceTo(page, null);
      await expect(playIntro).toBeVisible();
    });

    for (const viewport of [
      { width: 360, height: 740 },
      { width: 390, height: 844 },
    ]) {
      test(`${viewport.width}x${viewport.height}: the speaker ends the control row, right of the timeline and 16px inside the corner`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await freezeClock(page);
        const release = await holdAtlases(page);
        await page.goto('/#intro');
        await startSaga(page);
        await expect(sound(page)).toBeVisible();
        const [pause, timeline, snd] = await Promise.all([
          page.getByTestId('intro-pause').boundingBox(),
          page.getByTestId('intro-timeline').boundingBox(),
          sound(page).boundingBox(),
        ]);
        expect(timeline!.x).toBeGreaterThanOrEqual(pause!.x + pause!.width);
        expect(snd!.x).toBeGreaterThanOrEqual(timeline!.x + timeline!.width);
        expect(snd!.width).toBeGreaterThanOrEqual(40);
        expect(snd!.height).toBeGreaterThanOrEqual(40);
        expect(viewport.width - (snd!.x + snd!.width)).toBeGreaterThanOrEqual(16);
        expect(viewport.height - (snd!.y + snd!.height)).toBeGreaterThanOrEqual(16);
        release();
      });
    }

    test('the timeline seeks with the keyboard; the landfall stays locked until the tiles are loaded', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      const timeline = page.getByTestId('intro-timeline');
      await timeline.focus();
      await page.keyboard.press('PageDown');
      await expect(intro(page)).toHaveAttribute('data-beat', 'prophecy');
      await expect(page.getByTestId('intro-narration')).toBeVisible();

      // End would be the landfall, but it opens only with the tiles: the playhead parks at the end of the hold
      await page.keyboard.press('End');
      await expect(intro(page)).toHaveAttribute('data-beat', 'hold');
      await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
      await runFake(page, 30_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'hold');
      await expect(skip(page)).toBeHidden();

      release();
      await expect(intro(page)).toHaveAttribute('data-phase', 'exiting', TILES_LOADED);
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
      // the exit runs: the bar no longer seeks
      await timeline.focus();
      await page.keyboard.press('Home');
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
    });

    test('"Hear the saga" plays the clip with sound; the speaker mutes it, and it pauses with the intro', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const clip = await recordAudio(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page, 'hear');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await expect(sound(page)).toHaveAttribute('data-sound', 'on');
      await expect(sound(page)).toHaveAttribute('aria-pressed', 'true');
      expect(await animationName(page)).toBe('none');

      await expect.poll(() => clip('1-fire').then((c) => c !== null && !c.muted && c.currentTime > 0), { timeout: 15_000 }).toBe(true);
      await sound(page).click();
      await expect(sound(page)).toHaveAttribute('data-sound', 'off');

      await page.getByTestId('intro-pause').click();
      await expect(intro(page)).toHaveAttribute('data-voice-state', 'paused');
      expect((await clip('1-fire'))!.paused).toBe(true);
      await page.getByTestId('intro-pause').click();
      await expect(intro(page)).toHaveAttribute('data-voice-state', 'playing');
      expect((await clip('1-fire'))!.paused).toBe(false);
      release();
    });

    test('"or play it muted" plays the clip muted and blinks the speaker; clicking it unmutes the running clip', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const clip = await recordAudio(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page, 'muted');
      await expect(sound(page)).toHaveAttribute('data-sound', 'off');
      await expect(sound(page)).toHaveAttribute('aria-pressed', 'false');
      expect(await animationName(page)).not.toBe('none');

      // the clip already plays with its beat, muted
      await expect.poll(() => clip('1-fire').then((c) => c !== null && c.muted && c.currentTime > 0), { timeout: 15_000 }).toBe(true);
      await sound(page).click();
      await expect(sound(page)).toHaveAttribute('data-sound', 'on');
      expect(await animationName(page)).toBe('none');
      const playing = await clip('1-fire');
      expect(playing).toMatchObject({ muted: false, paused: false });
      release();
    });

    test('a beat lasts as long as its clip plus 0.8 s', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      // the English fire clip is 6113 ms long: 6913 ms with the tail
      await page.clock.runFor(6900);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await page.clock.runFor(30);
      await expect(intro(page)).toHaveAttribute('data-beat', 'prophecy');
      await expect(intro(page)).toHaveAttribute('data-voice-beat', 'prophecy');
      release();
    });

    test('skip stops the running clip and plays the landfall call', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const clip = await recordAudio(page);
      await page.goto('/#intro');
      await startSaga(page);
      await expect(skip(page)).toBeVisible(TILES_LOADED);
      await expect.poll(() => clip('1-fire').then((c) => c !== null)).toBe(true);
      await skip(page).click();
      await expect(intro(page)).toHaveAttribute('data-beat', 'landfall');
      await expect(intro(page)).toHaveAttribute('data-voice-beat', 'landfall');
      await expect(intro(page)).toHaveAttribute('data-voice-state', 'playing');
      expect((await clip('1-fire'))!.paused).toBe(true);
      await expect.poll(() => clip('6-landfall').then((c) => c !== null)).toBe(true);
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
    test('shows the first frame under the landing page; pressing "Hear the saga" runs the sequence', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');

      await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await expect(landingPage(page)).toBeVisible();
      await runFake(page, 20_000);
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');

      await startSaga(page);
      await page.clock.runFor(700); // lets the landing page's leave transition finish
      await expect(landingPage(page)).toHaveCount(0);
      await advanceTo(page, 'prophecy');
      release();
    });

    test('the sound button shows the off state without blinking', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/#intro');
      await startSaga(page, 'muted');
      await expect(sound(page)).toBeVisible();
      await expect(sound(page)).toHaveAttribute('data-sound', 'off');
      expect(await animationName(page)).toBe('none');
      await expect(sound(page)).toHaveClass(/is-muted/);
      release();
    });

    test('the Play intro button plays the intro at once, with the tiles already loaded', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await page.goto('/#no-intro');
      await expect(page.locator('canvas')).toBeVisible();
      await page.getByTestId('play-intro').click();
      await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
    });

    test('keeps waiting on the landing page when the tiles load before play is pressed', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const release = await holdAtlases(page);
      const log = await recordIntro(page);
      await page.goto('/#intro');
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'loading');

      release();
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'ready', TILES_LOADED);
      await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
      expect((await log()).phases).toEqual(['waitingForPlay']);
    });
  });

  test.describe('landing page', () => {
    test.use({ mapMotion: { hud: 'on' } });

    test('shows on a first visit over the hall: no narration or controls, Log in stays, nothing plays by itself', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/');

      await expect(landingPage(page)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'BJARNØY' })).toBeVisible();
      await expect(page.getByText('A saga of the north, played together.')).toBeVisible();
      await expect(page.getByTestId('landing-hear')).toBeVisible();
      await expect(page.getByTestId('landing-muted')).toBeVisible();
      await expect(page.getByTestId('intro-login')).toBeVisible();
      await expect(page.getByTestId('landing-how-to-play')).toHaveAttribute('href', '/docs');
      await expect(page.getByTestId('landing-impressum')).toHaveAttribute('href', '/impressum');
      await expect(page.getByTestId('intro-narration')).toHaveCount(0);
      await expect(page.getByTestId('intro-controls')).toHaveCount(0);
      await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
      await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
      await runFake(page, 20_000);
      await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
      release();
    });

    test('"Hear the saga" starts the saga and the landing page fades out', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/');
      await startSaga(page, 'hear');
      await expect(page.getByTestId('intro-narration')).toBeVisible();
      await page.clock.runFor(700); // the fade out (600 ms) runs on the frozen clock
      await expect(landingPage(page)).toHaveCount(0);
      release();
    });

    test('the camera turns into the hall after the click: the scene is at its identity before and turned after', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/');
      const cam = () => page.locator('.beat-layer .cam').first().evaluate((el) => getComputedStyle(el).transform);
      expect(await cam()).toMatch(IDENTITY);
      await startSaga(page, 'hear');
      // seeking puts the CSS animations at a time: pause, then jump 5 s in (past the 2.6 s turn) and back to the start
      await page.getByTestId('intro-pause').click();
      await page.getByTestId('intro-timeline').focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(cam).toMatch(/^matrix\(1\.26,/);
      await page.keyboard.press('Home');
      await expect.poll(cam).toMatch(IDENTITY);
      release();
    });

    test('the map button shows the load, arms when pressed while loading, opens the map as soon as it is loaded, and disarms on a second press', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await freezeClock(page);
      const release = await holdAtlases(page);
      await page.goto('/');

      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'loading');
      await expect(mapButton(page)).toContainText(/Go to the map · loading \d+ %/);
      await mapButton(page).click();
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'armed');
      await expect(mapButton(page)).toContainText(/Opens when loaded · \d+ %/);
      await mapButton(page).click();
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'loading');
      await mapButton(page).click();
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'armed');

      release();
      await expect(intro(page)).toHaveCount(0, TILES_LOADED);
      await expect(page.locator('canvas')).toBeVisible();
    });

    test('the map button closes the intro at once when the map is loaded', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const log = await recordIntro(page);
      await page.goto('/');
      await expect(mapButton(page)).toHaveAttribute('data-load-state', 'ready', TILES_LOADED);
      await expect(mapButton(page)).toContainText('Go to the map');
      await expect(mapButton(page)).toContainText('ready');
      await mapButton(page).click();
      await expect(intro(page)).toHaveCount(0);
      await expect(page.locator('canvas')).toBeVisible();
      expect((await log()).phases).toEqual(['waitingForPlay']);
    });

    test('shows the German text', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const release = await holdAtlases(page);
      await page.goto('/?lang=de#intro');
      await expect(page.getByTestId('landing-hear')).toHaveText('Saga anhören');
      await expect(page.getByTestId('landing-muted')).toHaveText('oder ohne Ton abspielen');
      await expect(mapButton(page)).toContainText(/Zur Karte · lädt \d+ %/);
      release();
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
    await expect(page.getByTestId('play-intro')).toBeVisible();
  });

  test('phones leave the play intro button out', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/#no-intro');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('play-intro')).toBeHidden();
  });

  test('phones play the intro from the landing menu', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/#no-intro');
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByTestId('returning-player-trigger').click();
    await page.getByTestId('returning-player-play-intro').click();
    await expect(intro(page)).toHaveAttribute('data-phase', 'playing');
    await expect(intro(page)).toHaveAttribute('data-beat', 'fire');
  });

  test('desktop menus leave the play intro row to the button', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/#no-intro');
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByTestId('returning-player-trigger').click();
    await expect(page.getByTestId('returning-player-start-page')).toBeVisible();
    await expect(page.getByTestId('returning-player-play-intro')).toBeHidden();
  });

  test('the landing menu opens the start page again', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/#no-intro');
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByTestId('returning-player-trigger').click();
    await page.getByTestId('returning-player-start-page').click();
    await expect(intro(page)).toHaveAttribute('data-phase', 'waitingForPlay');
    await expect(landingPage(page)).toBeVisible();
  });
});

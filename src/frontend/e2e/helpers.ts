import type { CDPSession, Locator, Page } from '@playwright/test';

/**
 * Waits for the map container's own mount-complete signal (`data-map-ready`,
 * set by useHexMapRenderer once HexMapRenderer.mount() resolves) plus one
 * real painted frame past it, instead of a guessed sleep — used by every
 * test that navigates to a view with a HexMapRenderer canvas (landing,
 * settlement, world) before interacting with it.
 */
export async function waitForMapReady(page: Page): Promise<void> {
  await page.locator('.map-container[data-map-ready]').waitFor({ timeout: 15_000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
  );
}

/**
 * Navigates to the world map and waits for its renderer to be ready.
 *
 * Real client-side navigation (the HudNav "World map" button), not
 * `page.goto('/world')` — a hard navigation reloads the whole app, and in
 * demo mode `hasFoundedSettlement` is intentionally never persisted to
 * localStorage (player.ts's own remarks: demo mode's WorldModel is pure
 * in-memory, so every reload starts a fresh session). A reload here silently
 * fails the router guard and redirects to `/`, whose landing-page preview
 * canvas also satisfies `.map-container[data-map-ready]` — so every caller
 * of this function was actually driving the *landing page's* canvas, not
 * the world map, without a single assertion failing to say so.
 *
 * docs/design/zoom-transition.md: `/world` and `/settlement` now share one
 * persistent renderer (MapView.vue), so `data-map-ready` alone no longer
 * distinguishes "the world map is up" from "the settlement view never went
 * away" — waiting for the URL first is what actually confirms the mode
 * switch happened.
 */
export async function gotoWorldMap(page: Page): Promise<void> {
  await page.locator('.hud-nav button', { hasText: 'World map' }).click();
  await page.waitForURL('**/world');
  await waitForMapReady(page);
}

/**
 * Clicks the landing page's starter plot and waits for the store to actually
 * hold a settlement. Assumes the landing page is already mounted
 * (`waitForMapReady`). Split out of `foundSettlement` so specs that stop at
 * the onboarding ring menu — which runs on the landing page, before the
 * nickname prompt — can share the same click instead of re-deriving it.
 */
export async function claimLandfall(page: Page): Promise<void> {
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  // The starter plot is deterministic and camera-centred (HexMapRenderer's
  // previewCenter), but shifted right of true screen centre by
  // LandingView's `screenBiasX` (0.16 of the viewport width) so the island
  // composes next to the hero text rather than behind it — see
  // HexMapRenderer's biasedCenterX.
  const cx = box.x + box.width * (0.5 + 0.16);
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);

  // Founding is async (even in demo mode, it's a Vue reactive update away) —
  // wait for the store to actually have a selected settlement before poking
  // it directly, rather than racing the click above.
  await page.waitForFunction(
    () => !!(window as unknown as { __demoWorld?: () => { selectedSettlementId: string | null } }).__demoWorld?.()
      ?.selectedSettlementId,
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Founds a settlement on the landing page (zip 6a: the landing page is the
 * village view — the starter plot is deterministic, so there's exactly one
 * hex to click, not a grid sweep across a world map), places the 2 guided
 * onboarding buildings, confirms the nickname prompt, and waits for
 * /settlement.
 */
export async function foundSettlement(page: Page): Promise<void> {
  // foundSettlement() alone — page load plus a real PixiJS/texture mount —
  // has been observed crossing the global 45s default on a loaded CI
  // runner. See settlement-interactions.spec.ts's matching comments for the
  // other tests that share this same root cause.
  await page.goto('/');

  // Wait on the renderer's own mount-complete signal rather than guessing
  // how long that takes — a fixed sleep here either wastes time on a fast
  // machine or, on a loaded CI runner, races the click below landing before
  // `mount()` has wired up pointer handling at all.
  await waitForMapReady(page);

  const prompt = page.getByText('Landfall made.');
  await claimLandfall(page);

  // Places the 2 guided onboarding buildings directly against the model —
  // real click-to-build UI is settlement-interactions.spec's job to cover;
  // this helper only needs the onboarding *gate* (hud.buildingsPlaced,
  // NicknamePrompt) to fire reliably, and the settlement's own zoom (picked
  // by zoomForFogMargin to keep a wide fog margin on screen) makes clicking
  // a specific nearby hex by pixel offset unreliable. __demoWorld is the
  // same test/debug hook main.ts documents for exactly this kind of
  // "drive WorldModel directly" case.
  await page.evaluate(() => {
    const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void } }).__demoWorld();
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    let placed = 0;
    for (let radius = 1; radius <= 2 && placed < 2; radius++) {
      for (const [dq, dr] of dirs) {
        if (placed >= 2) break;
        const at = { q: settlement.q + dq * radius, r: settlement.r + dr * radius };
        if (world.model.placeBuilding(world.selectedSettlementId, at, 'hut')) placed++;
      }
    }
    world.syncHud();
  });

  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('button.confirm').click();
  await page.waitForURL('**/settlement');
  // The confirm click navigates to a *new* SettlementCanvas mount (a fresh
  // renderer, not the landing page's preview one) — wait for its own
  // mount-complete signal instead of guessing how long that takes.
  await waitForMapReady(page);
}

/**
 * Every matched element's on-screen box and visibility, read in **one**
 * round trip.
 *
 * The obvious spelling — `expect(nth(i)).toBeVisible()` then
 * `nth(i).boundingBox()` in a loop — costs two CDP round trips per element.
 * That is cheap against an idle page and expensive against this app's
 * canvas views, where a software-rendered runner can leave the main thread
 * blocked for hundreds of milliseconds at a time and every round trip waits
 * out whatever frame is in flight. `ring-menu.spec.ts`'s drill-down test
 * asserts over two rings' worth of bubbles that way and spent its whole 90s
 * budget doing it (issue #167).
 *
 * `evaluateAll` collapses that to a single call, and returns enough to make
 * the same assertions: `visible` matches what Playwright's own visibility
 * check means (a non-empty box, not `visibility: hidden` or
 * `display: none`), and the box is in the same client coordinates
 * `boundingBox()` reports.
 */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  text: string;
}

export function rectsOf(locator: Locator): Promise<ElementRect[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        visible:
          r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        text: (el.textContent ?? '').trim(),
      };
    }),
  );
}

/** Centre-to-centre distance from `(x, y)` to a rect returned by rectsOf. */
export function distanceFrom(rect: ElementRect, x: number, y: number): number {
  return Math.hypot(rect.x + rect.width / 2 - x, rect.y + rect.height / 2 - y);
}

/** One CDP session per page — opening a second one per screenshot would cost more than it saves. */
const cdpSessions = new WeakMap<Page, Promise<CDPSession>>();

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
 */
export async function captureCanvas(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  let session = cdpSessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  const { data } = await (await session).send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
  });
  return Buffer.from(data, 'base64');
}

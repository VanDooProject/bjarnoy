import type { CDPSession, Locator, Page } from '@playwright/test';
import { AdminAuthFixture } from './pages/AdminAuthFixture';

/**
 * Logs the page in as an ordinary authenticated player, before the page's
 * first navigation — same pattern as `AdminAuthFixture.loginAsPlayer`
 * (issue #189's shared mocked-session helper, reused here rather than
 * duplicated): seeds a refresh token into localStorage and mocks
 * `/auth/refresh` + `/auth/me`, rather than driving `/register` through the
 * real form every time. Demo mode (what this whole harness runs against —
 * see playwright.config.ts) has no real `/auth/login` to hit anyway, so this
 * is also the *fastest* path to `auth.isAuthenticated === true` this suite
 * has, not just the most convenient.
 *
 * Added for the returning-player nav work: HudNav's "World map" and
 * "Leaderboards" links now require `auth.isAuthenticated` (previously just a
 * founded settlement, or nothing at all — see HudNav.vue), so any spec that
 * clicks either now needs a real authenticated session first. Must be
 * called before the page's first navigation — an `addInitScript` only takes
 * effect on a *subsequent* one — so call it before
 * `foundSettlement`/`SettlementPage.found`/`WorldMapPage.open`, not after.
 */
export async function loginTestUser(page: Page, userName = 'e2e-player'): Promise<void> {
  await new AdminAuthFixture(page).loginAsPlayer(userName);
}

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
  // Ask the renderer where the preview plot actually is, rather than
  // hard-coding a fraction of the canvas: docs/plans/landing-page-defects.md
  // L4/L5 moved the pre-founding camera from "centred on the plot" to
  // "centred on the drawn island's bounding box", which silently broke the
  // old `(0.5 + 0.16) × width` "screenBiasX" click point — it no longer
  // lands on the same hex, and demo mode founds wherever it happens to
  // land instead. `__settlementRenderer().previewCenter` is the exact
  // coordinate LandingView is previewing (demo: `findLandfall`; live:
  // `plotSuggestion.plot`), and `hexCenterScreen` is the renderer's own
  // camera math converting that coordinate to a screen point — the same
  // technique `SettlementPage.findHex`/`landing.spec.ts`'s ring-menu test
  // already use. This is robust to *any* future reframing of the preview
  // camera, since it never assumes where on screen the plot ends up.
  const { x: hx, y: hy } = await page.evaluate(() => {
    const renderer = (
      window as unknown as {
        __settlementRenderer: () => {
          previewCenter?: { q: number; r: number };
          hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
        };
      }
    ).__settlementRenderer();
    if (!renderer.previewCenter) {
      throw new Error('__settlementRenderer().previewCenter is unset — is the landing page preview mounted yet?');
    }
    return renderer.hexCenterScreen(renderer.previewCenter);
  });
  const cx = box.x + hx;
  const cy = box.y + hy;
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
 * onboarding buildings, confirms the completion banner's hand-off, and
 * waits for /settlement.
 *
 * Design handoff "2a": onboarding's own forced nickname modal is gone —
 * completion now shows a dismissible banner with an explicit "Enter your
 * settlement" CTA (OnboardingBanner.vue), which is what this now waits on
 * and clicks instead of the old button.confirm.
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

  await claimLandfall(page);

  // Places the 2 guided onboarding buildings directly against the model —
  // real click-to-build UI is settlement-interactions.spec's job to cover;
  // this helper only needs the onboarding *gate*
  // (onboardingGuidance.deriveOnboardingGuidance's `complete`, which now
  // specifically requires farm + lumberjack rather than any 3 buildings) to
  // fire reliably, and the settlement's own zoom (picked by
  // zoomForFogMargin to keep a wide fog margin on screen) makes clicking a
  // specific nearby hex by pixel offset unreliable. __demoWorld is the same
  // test/debug hook main.ts documents for exactly this kind of "drive
  // WorldModel directly" case. placeBuilding itself doesn't enforce
  // terrain (only the ring UI does — see LandingView's GUIDED_BUILD_TERRAIN),
  // so any nearby empty hex works for either type.
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
    const guidedTypes = ['farm', 'lumberjack'];
    let placed = 0;
    for (let radius = 1; radius <= 2 && placed < guidedTypes.length; radius++) {
      for (const [dq, dr] of dirs) {
        if (placed >= guidedTypes.length) break;
        const at = { q: settlement.q + dq * radius, r: settlement.r + dr * radius };
        if (world.model.placeBuilding(world.selectedSettlementId, at, guidedTypes[placed])) placed++;
      }
    }
    world.syncHud();
  });

  await page.getByTestId('onboarding-continue').click();
  await page.waitForURL('**/settlement');
  // The click navigates to a *new* SettlementCanvas mount (a fresh renderer,
  // not the landing page's preview one) — wait for its own mount-complete
  // signal instead of guessing how long that takes.
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

/** One CDP session per page — opening a second one per call site would cost more than it saves. */
const cdpSessions = new WeakMap<Page, Promise<CDPSession>>();

function cdpSessionFor(page: Page): Promise<CDPSession> {
  let session = cdpSessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  return session;
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
 */
export async function captureCanvas(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const { data } = await (await cdpSessionFor(page)).send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
  });
  return Buffer.from(data, 'base64');
}

/**
 * Drives a real two-finger pinch via CDP's `Input.dispatchTouchEvent` —
 * `page.touchscreen` only exposes single-finger `tap`, and HexMapRenderer's
 * pinch handling (see docs/design/zoom-transition.md §9.2) is keyed on
 * genuinely distinct `pointerId`s reaching the canvas, which only a real
 * multi-touch-point dispatch produces.
 *
 * Spreads (or closes) two touch points symmetrically around `centre` from
 * `fromGap` to `toGap` px apart over `steps` intermediate `touchMove`s, then
 * lifts both. Each touch point's `id` stays fixed across the whole gesture
 * so the renderer's `pointerId`-keyed `PinchTracker` sees one continuous
 * pair rather than a new pair each step.
 */
export async function pinch(
  page: Page,
  centre: { x: number; y: number },
  fromGap: number,
  toGap: number,
  steps = 8,
): Promise<void> {
  const session = await cdpSessionFor(page);
  const pointsAt = (gap: number) => [
    { x: centre.x - gap / 2, y: centre.y, id: 0 },
    { x: centre.x + gap / 2, y: centre.y, id: 1 },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pointsAt(fromGap) });
  for (let i = 1; i <= steps; i++) {
    const gap = fromGap + ((toGap - fromGap) * i) / steps;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pointsAt(gap) });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A single-finger touch drag via the same `Input.dispatchTouchEvent` CDP
 * path `pinch` uses — `page.touchscreen` has no drag primitive (only
 * `tap`), and this is what a pinch spec needs to prove a lone finger still
 * pans the map after HexMapRenderer's pointer handling became pointerId-
 * keyed (see docs/design/zoom-transition.md §9.2) rather than assuming a
 * single global pointer.
 */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
): Promise<void> {
  const session = await cdpSessionFor(page);
  const pointAt = (x: number, y: number) => [{ x, y, id: 0 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pointAt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pointAt(x, y) });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Every visible interactive element inside the app root (`#app`) that sits
 * partly outside the viewport, plus whether the page itself scrolls
 * sideways — read in one round trip, for the phone-viewport layout checks
 * in `mobile.spec.ts`.
 *
 * Scoped to `#app` on purpose: PixiJS appends its own accessibility touch
 * hook (a `<button>` parked at -1000,-1000) straight onto `<body>`, which is
 * deliberately off-screen and not ours to lay out. An element inside a
 * horizontally scrollable ancestor (the mobile resource strip, the tech
 * tree's wide grid) may run past that ancestor's right edge as long as the
 * ancestor really scrolls — the user swipes to it — but never past its left
 * edge: overflow to the left of a scroll container's origin is unreachable,
 * which is exactly how HudNav's links used to disappear.
 */
export async function layoutOverflow(page: Page): Promise<{ pageScrollsSideways: boolean; offscreen: string[] }> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element, r: DOMRect) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 24)}" [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
    const scrollsX = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);
    const offscreen: string[] = [];
    for (const el of document.querySelectorAll('#app button, #app a[href], #app input, #app select, #app textarea, #app [role="button"]')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      let scroller: Element | null = el.parentElement;
      while (scroller && scroller !== document.body && !scrollsX(scroller)) scroller = scroller.parentElement;
      const bounds = scroller && scroller !== document.body ? scroller.getBoundingClientRect() : null;
      const left = Math.max(0, bounds?.left ?? 0);
      const right = Math.min(vw, bounds?.right ?? vw);
      const canScrollRight = !!scroller && scroller !== document.body && scroller.scrollWidth > scroller.clientWidth;
      if (r.left < left - 1 || (r.right > right + 1 && !canScrollRight) || r.top < -1) offscreen.push(describe(el, r));
    }
    return { pageScrollsSideways: document.documentElement.scrollWidth > vw + 1, offscreen: [...new Set(offscreen)] };
  });
}

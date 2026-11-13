import { expect, type Page } from '@playwright/test';
import type { SettlementPage } from './pages/SettlementPage';
import { waitForMapReady } from './support/render';

/**
 * Switches the map to world mode and waits for its renderer to be ready.
 *
 * Players switch by zooming out; world mode is marked by the `#world` hash on
 * `/settlement` (lib/mapModeRoute.ts), so this sets that hash — a fragment
 * navigation the router picks up without reloading — rather than replaying a
 * whole zoom gesture (zoom-transition.spec.ts covers the gesture itself).
 * Not `page.goto('/settlement#world')` — a hard navigation reloads the whole app, and in
 * demo mode `hasFoundedSettlement` is intentionally never persisted to
 * localStorage (player.ts's own remarks: demo mode's WorldModel is pure
 * in-memory, so every reload starts a fresh session). A reload here silently
 * fails the router guard and redirects to `/`, whose landing-page preview
 * canvas also satisfies `.map-container[data-map-ready]` — so every caller
 * of this function was actually driving the *landing page's* canvas, not
 * the world map, without a single assertion failing to say so.
 *
 * docs/design/zoom-transition.md: world and settlement mode share one
 * persistent renderer (MapView.vue), so `data-map-ready` alone no longer
 * distinguishes "the world map is up" from "the settlement view never went
 * away" — waiting for the URL first is what actually confirms the mode
 * switch happened.
 */
export async function gotoWorldMap(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = 'world';
  });
  await page.waitForURL(/\/settlement#world(&.*)?$/);
  await waitForMapReady(page);
}

/**
 * Clicks a secondary HUD destination (Leaderboards, Messages, Reports,
 * Alliance, Docs, Landing) on a desktop-width bar: those entries live in the
 * avatar's dropdown — the account menu when logged in, the returning-player
 * menu otherwise — except Docs, which sits inline in `.hud-nav` on a wide bar. `label` is the visible row text
 * (a Reports row may carry an unread count after it). One helper so no spec
 * has to know where the entries live; phone specs use the drawer instead.
 */
export async function clickHudMenuEntry(page: Page, label: string): Promise<void> {
  // Docs sits inline on a wide enough bar (lib/breakpoints.ts's HUD_NAV_ROOMY_QUERY).
  const inline = page.locator('.hud-nav > a.link', { hasText: label });
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  const account = page.getByTestId('account-menu-trigger');
  const trigger = (await account.isVisible()) ? account : page.getByTestId('returning-player-trigger');
  await trigger.click();
  await page.locator('[role="menu"] [role="menuitem"]', { hasText: label }).click();
}

/**
 * Opens the phone HUD drawer (TopBar.vue's `.hud-grip`) and waits until it
 * has finished opening. Tap anything inside the drawer only after this.
 *
 * While the drawer grows open (a 180ms height transition), the rows inside
 * don't move, they are only uncovered. Playwright's stability check passes on
 * a row that is still clipped, and its scroll-into-view then scrolls
 * `.hud-drawer-scroll` to bring it out. The still-growing drawer clamps that
 * scroll back on every frame, so the row slides while the click is under way.
 * Playwright hit-checks only the press: when the release lands on another
 * element, the browser sends the click to their common ancestor and the
 * row's handler never runs (seen as "Later" on the profile nudge doing
 * nothing on a 320x568 phone).
 */
export async function openHudDrawer(page: Page): Promise<void> {
  const grip = page.locator('.hud-grip');
  if ((await grip.getAttribute('aria-expanded')) !== 'true') await grip.click();
  await expect(grip).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() => page.locator('.hud-drawer').evaluate((el) => el.getAnimations().length))
    .toBe(0);
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
    const renderer = window.__settlementRenderer();
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
  // it directly, rather than racing the click above. Then wait out the
  // founding camera transition too (HexMapRenderer.animateCameraTo, 1.4 s):
  // until it lands, every hex's `hexCenterScreen` is still sliding toward the
  // settlement framing, so a spec that reads a hex's screen point right after
  // this returns (`SettlementPage.findHex`) and clicks it later hits whatever
  // hex has moved under that point by then — under load the ring then never
  // opened, because the stale point had become sea or the longhouse.
  // `previewCenter` is cleared by the same `updateOptions` call that starts
  // the ease, so "no preview and not animating" is the settled camera.
  await page.waitForFunction(
    () => {
      const renderer = window.__settlementRenderer?.();
      return !!window.__demoWorld?.()?.selectedSettlementId && !!renderer && !renderer.previewCenter && !renderer.cameraAnimating;
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Leaves the landing page for /settlement once onboarding is complete. While
 * the "Name your jarl" nudge floats on screen (an anonymous player),
 * the completion banner waits for it, so this goes through the HUD's own
 * Settlement link (inline on a wide bar, in the drawer on a phone) and
 * leaves the nudge for the spec to answer; a signed-in player gets the
 * banner's "Enter your settlement".
 */
export async function enterSettlementAfterOnboarding(page: Page): Promise<void> {
  const cta = page.getByTestId('onboarding-continue');
  const floatingNudge = page.locator('[data-testid="profile-nudge"]:visible');
  await expect(cta.or(floatingNudge).first()).toBeVisible();
  if (await cta.isVisible()) {
    await cta.click();
    return;
  }
  // A wide bar carries the nav inline; a phone bar keeps it in the drawer.
  const inlineNav = page.locator('.hud-nav a.link', { hasText: 'Settlement' });
  if (await inlineNav.isVisible()) {
    await inlineNav.click();
    return;
  }
  await openHudDrawer(page);
  await page.locator('.hud-drawer .drawer-links a', { hasText: 'Settlement' }).click();
}

/**
 * Founds a settlement on the landing page (zip 6a: the landing page is the
 * village view — the starter plot is deterministic, so there's exactly one
 * hex to click, not a grid sweep across a world map), places the 2 guided
 * onboarding buildings, hands off to the settlement view
 * (`enterSettlementAfterOnboarding`), and waits for /settlement.
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
  await page.goto('/#no-intro');

  // Wait on the renderer's own mount-complete signal rather than guessing
  // how long that takes — a fixed sleep here either wastes time on a fast
  // machine or, on a loaded CI runner, races the click below landing before
  // `mount()` has wired up pointer handling at all.
  await waitForMapReady(page);

  await claimLandfall(page);

  await placeGuidedBuildings(page);

  await enterSettlementAfterOnboarding(page);
  await page.waitForURL('**/settlement');
  // The click navigates to a *new* SettlementCanvas mount (a fresh renderer,
  // not the landing page's preview one) — wait for its own mount-complete
  // signal instead of guessing how long that takes.
  await waitForMapReady(page);
}

/**
 * Places the 2 guided onboarding buildings (reindeer herder + lumberjack) next to the
 * freshly founded settlement, which completes onboarding and shows the
 * completion banner. Assumes `claimLandfall` has already run.
 */
export async function placeGuidedBuildings(page: Page): Promise<void> {
  // Places the 2 guided onboarding buildings directly against the model —
  // real click-to-build UI is settlement-interactions.spec's job to cover;
  // this helper only needs the onboarding *gate*
  // (onboardingGuidance.deriveOnboardingGuidance's `complete`, which now
  // specifically requires reindeer herder + lumberjack rather than any 3 buildings) to
  // fire reliably, and the settlement's own zoom (picked by
  // zoomForFogMargin to keep a wide fog margin on screen) makes clicking a
  // specific nearby hex by pixel offset unreliable. __demoWorld is the same
  // test/debug hook main.ts documents for exactly this kind of "drive
  // WorldModel directly" case. placeBuilding itself doesn't enforce
  // terrain (only the ring's placement filter does, see useBuildRing),
  // so any nearby empty hex works for either type.
  await page.evaluate(() => {
    const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    const dirs: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    const guidedTypes = ['reindeerherder', 'lumberjack'];
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
}

/**
 * Opens the ring menu on the guided hex GuidancePointer.vue is currently
 * aiming at (design handoff "2a" frame 2, right after landfall — the pointer
 * follows the camera via `useMapAnchor`, which writes the hex's screen point
 * into `--anchor-x`/`--anchor-y` on `[data-testid="guidance-pointer"]`) and
 * waits for the pointer's first in-ring step ("Open Build", aimed at the Build hub), the case the chip's
 * placement bug was found on. Reads the anchor vars rather than re-deriving
 * the guided hex from `__demoWorld`, since GuidancePointer's own screen math
 * (camera + arrowTipOffset) is exactly where the click needs to land.
 */
/** Frames `openRingOnGuidedHex` waits for the pointer's anchor to stop moving: well past the 1.4 s founding ease at 60 fps. */
const GUIDANCE_SETTLE_MAX_FRAMES = 600;

/** `chipText`: what the pointer's chip says once the ring is open, when the app is not in English. */
export async function openRingOnGuidedHex(settlement: SettlementPage, chipText = 'Open Build'): Promise<void> {
  const pointer = settlement.guidancePointer;
  // The anchor follows the camera: a click on an anchor read mid-ease can land on the hex the guided one is about to
  // slide away from. Wait in the page until useMapAnchor writes the same point on consecutive animation frames, so the
  // click lands where the pointer comes to rest. The wait counts frames, not wall time, and takes one round trip.
  // It used to be an `expect.poll` of two `getAttribute` reads 250 ms apart inside expect's 5 s budget. Under CPU
  // starvation (8x CDP throttle) a single round trip took up to 4 s, so the second read landed after the deadline
  // and the test failed with the anchor already at rest (every read in 20 throttled runs returned the same point).
  const anchor = await pointer.evaluate(async (el, maxFrames) => {
    const read = (): string => {
      const x = el.style.getPropertyValue('--anchor-x');
      const y = el.style.getPropertyValue('--anchor-y');
      return x && y ? `${parseFloat(x)},${parseFloat(y)}` : '';
    };
    let previous = read();
    for (let frame = 0; frame < maxFrames; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = read();
      if (now !== '' && now === previous) return now;
      previous = now;
    }
    return null;
  }, GUIDANCE_SETTLE_MAX_FRAMES);
  expect(anchor, 'guidance pointer never came to rest on an anchor point').not.toBeNull();
  const [x, y] = anchor!.split(',').map(Number) as [number, number];
  const box = await settlement.canvasBox();
  await settlement.page.mouse.click(box.x + x, box.y + y);
  await settlement.ring.waitForOpen();
  await expect(pointer.locator('.chip')).toContainText(chipText);
}

/**
 * Builds `building` through the onboarding's ring on the already-clicked hex, the way a player does: Build hub, then
 * the category, then the building (the ring is the map's own, see useBuildRing). A phone taps (the first tap on a
 * building arms it and docks its card, the second commits); desktop clicks with the real pointer.
 */
export async function buildThroughOpenRing(settlement: SettlementPage, category: string, building: string): Promise<void> {
  const ring = settlement.ring;
  await ring.waitForOpen();
  const phone = (settlement.page.viewportSize()?.width ?? 1280) <= 768;
  if (phone) {
    await ring.action('Build').first().tap();
    await ring.settledLayer();
    await ring.category(category).first().tap();
    await ring.settledLayer();
    const bubble = ring.child(building).first();
    await expect(bubble).toBeVisible();
    await bubble.tap();
    await bubble.tap();
    return;
  }
  await ring.openBuildCategories();
  await ring.openCategory(category);
  await ring.click(ring.child(building).first());
}

/**
 * Where the guidance arrow's tip rests relative to the ring bubbles: the bubble (or the hub) whose rim is nearest the
 * tip, by its accessible name or text, how far the tip is from that rim in px (negative: inside it), and the ring
 * bubble `elementFromPoint` finds under the tip (null when nothing). The tip is read off the arrow's own polygon
 * through the SVG's screen transform, with the bob taken out, so it is where the arrow really rests (rotation and
 * placement included), not a re-derivation of GuidancePointer's maths. The arrow is pointer-events: none, so
 * `elementFromPoint` sees what a finger would hit.
 */
export async function bubbleNearestPointerTip(
  page: Page,
): Promise<{ nearest: string; rimDistance: number; under: string | null } | null> {
  return page.evaluate(() => {
    const polygon = document.querySelector<SVGPolygonElement>('[data-testid="guidance-pointer"] svg polygon');
    const svg = polygon?.ownerSVGElement;
    const ctm = polygon?.getScreenCTM();
    const bob = document.querySelector<HTMLElement>('[data-testid="guidance-pointer"] .bob');
    if (!polygon || !svg || !ctm || !bob) return null;
    // The bob slides the arrow back along its shaft; the rest position is what the placement rule is about.
    const bobbed = new DOMMatrix(getComputedStyle(bob).transform).f;
    const point = svg.createSVGPoint();
    point.x = 75;
    point.y = 136 - bobbed / (110 / 150);
    const tip = point.matrixTransform(ctm);
    const name = (el: Element) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim();
    // A lone Build bubble sits on the hub on a cramped ring: the two are one thing to the eye, the bigger rim counts.
    const circles = [...document.querySelectorAll('.ring-bubble, .ring-hub')].map((el) => {
      const box = el.getBoundingClientRect();
      return { el, x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.width / 2 };
    });
    let best: { nearest: string; rimDistance: number } | null = null;
    for (const c of circles) {
      if (c.el.classList.contains('ring-hub') && circles.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 1)) continue;
      const r = Math.max(...circles.filter((o) => Math.hypot(o.x - c.x, o.y - c.y) < 1).map((o) => o.r));
      const rimDistance = Math.hypot(tip.x - c.x, tip.y - c.y) - r;
      if (!best || rimDistance < best.rimDistance) best = { nearest: name(c.el), rimDistance };
    }
    if (!best) return null;
    const hit = document.elementFromPoint(tip.x, tip.y)?.closest('.ring-bubble, .ring-hub');
    return { ...best, under: hit ? name(hit) : null };
  });
}

/**
 * Puts five standing fleets on five different hexes of the open sea, up to ~300 hexes from the settlement (demo mode has no army simulation, so they go straight
 * into the store) and returns an empty, inland grass hex of the realm: no fleet can ever reach it, so every route search for it fails.
 * `screen` is that hex's centre on the settlement canvas. The fleets' home (where a leg must be able to return to) is the settlement, an
 * inland hex no fleet can reach, unless `homeAt` names another (a coastal hex of the realm).
 */
export async function putFleetsFarAtSea(
  page: Page,
  homeAt?: { q: number; r: number },
): Promise<{ hex: { q: number; r: number }; screen: { x: number; y: number } }> {
  return page.evaluate((homeOverride) => {
    const world = window.__demoWorld() as { model: any; selectedSettlementId: string; armies: unknown[] };
    const home = world.model.getSettlement(world.selectedSettlementId);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
    const isSea = (q: number, r: number) => world.model.getTile(q, r).terrain === 'sea';
    // One far open-sea hex per fleet, all different: every fleet is its own route search (its own cache key).
    const seas: Array<{ q: number; r: number }> = [];
    for (let d = 300; d > 50 && seas.length < 5; d -= 5) {
      for (const [dq, dr] of sides) {
        const at = { q: home.q + dq * d, r: home.r + dr * d };
        if (seas.length < 5 && isSea(at.q, at.r) && sides.every(([a, b]) => isSea(at.q + a, at.r + b))) seas.push(at);
      }
    }
    if (seas.length < 5) throw new Error('no five open-sea hexes far from home');
    const arrived = new Date(Date.now() - 60_000).toISOString();
    world.armies = seas.map((sea, i) => ({
      id: `fleet-${i}`,
      settlementId: world.selectedSettlementId,
      mission: 'move',
      targetSettlementId: null,
      atHome: false,
      supporting: false,
      position: sea,
      provisions: 1_000_000,
      totalSpeed: 10,
      totalUpkeepPerHour: 1,
      visionRadius: 4,
      stacks: [{ unit: 'longship', count: 1 }],
      movement: { path: [homeOverride ?? { q: home.q, r: home.r }, sea], isReturning: false, departedAt: arrived, arrivesAt: arrived },
    }));
    for (let dq = -3; dq <= 3; dq++) {
      for (let dr = -3; dr <= 3; dr++) {
        const at = { q: home.q + dq, r: home.r + dr };
        const tile = world.model.getTile(at.q, at.r);
        if (tile.ownerId !== world.selectedSettlementId || tile.buildingType || tile.terrain !== 'grass') continue;
        if (sides.some(([a, b]) => isSea(at.q + a, at.r + b))) continue;
        return { hex: at, screen: window.__settlementRenderer().hexCenterScreen(at) };
      }
    }
    throw new Error('no empty inland grass hex in the realm');
  }, homeAt);
}

/** Triggers an armies refresh, as the live poll does: every army is replaced by a copy. */
export async function refreshArmies(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = window.__demoWorld() as { armies: object[] };
    world.armies = world.armies.map((a) => ({ ...a }));
  });
}

// See RingMenuComponent.ts for why `expect` comes from here, not `../fixtures`.
import { expect, type Locator, type Page } from '@playwright/test';
import { RingMenuComponent } from './RingMenuComponent';
import { openHudDrawer } from '../support/hud';

/** Frames `openRingOnGuidedHex` waits for the pointer's anchor to stop moving: well past the 1.4 s founding ease at 60 fps. */
const GUIDANCE_SETTLE_MAX_FRAMES = 600;

/**
 * The guided onboarding (design handoff "2a") on the landing page: its UI (pointer, checklist, banner, hand-off to
 * /settlement, profile nudge) and the flows through it. The landing page mounts the same renderer and ring menu as the
 * settlement view, so the ring is reached through its own `RingMenuComponent`.
 */
export class OnboardingComponent {
  /** Design handoff "2a": the animated next-step arrow (GuidancePointer.vue). */
  readonly guidancePointer: Locator;
  /** The guided-onboarding checklist tray (OnboardingChecklist.vue). */
  readonly checklist: Locator;
  /** The landfall/completion pill banner (OnboardingBanner.vue) — filter with `.landfall`/`.complete`. */
  readonly banner: Locator;
  /** The completion banner's explicit hand-off to /settlement. */
  readonly continueButton: Locator;
  /** The profile-mark tooltip that replaces the old nickname modal (ProfileNudge.vue). */
  readonly profileNudge: Locator;
  private readonly ring: RingMenuComponent;
  private readonly canvasBox: () => Promise<{ x: number; y: number; width: number; height: number }>;

  readonly page: Page;

  /** `canvasBox`: where the canvas sits; `SettlementPage` passes its cached box, standalone use reads it fresh. */
  constructor(page: Page, canvasBox?: () => Promise<{ x: number; y: number; width: number; height: number }>) {
    this.page = page;
    this.canvasBox = canvasBox ?? (async () => (await page.locator('canvas').boundingBox())!);
    this.ring = new RingMenuComponent(page);
    this.guidancePointer = page.getByTestId('guidance-pointer');
    this.checklist = page.getByTestId('onboarding-checklist');
    this.banner = page.getByTestId('onboarding-banner');
    this.continueButton = page.getByTestId('onboarding-continue');
    this.profileNudge = page.getByTestId('profile-nudge');
  }

  /**
   * Clicks the landing page's starter plot and waits for the store to actually
   * hold a settlement. Assumes the landing page is already mounted
   * (`waitForMapReady`). Split out of `SettlementPage.found` so specs that stop at
   * the onboarding ring menu — which runs on the landing page, before the
   * nickname prompt — can share the same click instead of re-deriving it.
   */
  async claimLandfall(): Promise<void> {
    const { page } = this;
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
  async enterSettlement(): Promise<void> {
    const { page } = this;
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
   * Places the 2 guided onboarding buildings (reindeer herder + lumberjack) next to the
   * freshly founded settlement, which completes onboarding and shows the
   * completion banner. Assumes `claimLandfall()` has already run.
   */
  async placeGuidedBuildings(): Promise<void> {
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
    await this.page.evaluate(() => {
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
  /** `chipText`: what the pointer's chip says once the ring is open, when the app is not in English. */
  async openRingOnGuidedHex(chipText = 'Open Build'): Promise<void> {
    const pointer = this.guidancePointer;
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
    const box = await this.canvasBox();
    await this.page.mouse.click(box.x + x, box.y + y);
    await this.ring.waitForOpen();
    await expect(pointer.locator('.chip')).toContainText(chipText);
  }

  /**
   * Where the guidance arrow's tip rests relative to the ring bubbles: the bubble (or the hub) whose rim is nearest the
   * tip, by its accessible name or text, how far the tip is from that rim in px (negative: inside it), and the ring
   * bubble `elementFromPoint` finds under the tip (null when nothing). The tip is read off the arrow's own polygon
   * through the SVG's screen transform, with the bob taken out, so it is where the arrow really rests (rotation and
   * placement included), not a re-derivation of GuidancePointer's maths. The arrow is pointer-events: none, so
   * `elementFromPoint` sees what a finger would hit.
   */
  async bubbleNearestPointerTip(): Promise<{ nearest: string; rimDistance: number; under: string | null } | null> {
    return this.page.evaluate(() => {
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
}

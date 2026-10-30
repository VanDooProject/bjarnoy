// `expect` here rather than from `../fixtures` on purpose: `fixtures.ts`
// imports the admin auth fixture out of this directory, so importing back
// into it would close a module cycle. It is the same `expect` object
// `fixtures.ts` re-exports — only `test` carries the autouse fixtures specs
// must not bypass.
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The ring menu (issue #16) — the radial menu a hex click opens, in both
 * SettlementView and LandingView's onboarding step.
 *
 * DOM contract, previously spelled out as raw selectors in seven specs:
 * the "2a" ring caps itself at two lanes, so drilling *swaps* the inner lane
 * rather than adding an orbit outside it. `.ring-bubble.back` is the
 * reserved ‹ BACK slot, `.ring-bubble.child` the outer lane, and what is
 * left over is the root actions / build categories, depending on depth.
 */
export class RingMenuComponent {
  /** Every bubble on screen, at any depth — the "is a ring open at all" signal. */
  readonly bubbles: Locator;
  /** The reserved ‹ BACK slot. */
  readonly backBubble: Locator;
  /** The inner lane: root actions before drilling, build categories after. */
  readonly categoryBubbles: Locator;
  /** The outer lane: the buildings inside the opened category. */
  readonly childBubbles: Locator;
  /** The informational cost/time/gate card docked beside the ring. */
  readonly card: Locator;
  /** The ring's own full-screen backdrop. */
  readonly backdrop: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.bubbles = page.locator('.ring-bubble');
    this.backBubble = page.locator('.ring-bubble.back');
    this.categoryBubbles = page.locator('.ring-bubble:not(.back):not(.child)');
    this.childBubbles = page.locator('.ring-bubble.child');
    this.card = page.locator('.ring-card');
    this.backdrop = page.locator('.ring-backdrop');
  }

  /** A bubble at any depth by label, e.g. "Build", "Upgrade". */
  action(label: string): Locator {
    return this.page.locator('.ring-bubble', { hasText: label });
  }

  /** An inner-lane bubble by label, e.g. "Military", "Shrines", "Water". */
  category(label: string): Locator {
    return this.page.locator('.ring-bubble:not(.back):not(.child)', { hasText: label });
  }

  /** An outer-lane building bubble by label, e.g. "Watchtower", "Sawmill". */
  child(label: string): Locator {
    return this.page.locator('.ring-bubble.child', { hasText: label });
  }

  /**
   * Every bubble's accessible name (its aria-label), at any depth, in **one** round trip - for the
   * assertions about which bubbles are on screen, which would otherwise be one `toHaveCount` round
   * trip per label (see `settledCentre` for what a round trip costs on this app's canvas views).
   */
  labels(): Promise<string[]> {
    return this.bubbles.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()));
  }

  /** Waits for a ring to have opened at all. */
  async waitForOpen(): Promise<void> {
    await expect(this.bubbles.first()).toBeVisible();
  }

  /**
   * The bubble's centre once it can be pointed at, found in **one** round trip.
   *
   * Every Playwright call is a round trip to a page whose render loop is busy
   * (a frame is hundreds of milliseconds on a software-rendered runner, several
   * times that with parallel workers). Before the loop was paced (framePacing.ts)
   * a bare `evaluate` measured ~1s, a `boundingBox()` ~2.5s and a
   * `locator.click()` ~5s (visible, enabled, stable and hit-target checks, each
   * its own round trip) on an otherwise idle machine; they are far cheaper now,
   * but still one wait each. A hover spelled
   * `expect(visible)` + `boundingBox()` + `mouse.move` was ~6s, so a spec that
   * drives a few dozen bubbles spent its whole budget waiting for frames.
   *
   * So the waiting happens in the page instead, one rAF at a time, for what
   * Playwright's own click waits for: the bubble is laid out, visible, enabled
   * (when `enabled`), no longer animating - nor is anything else in the ring (the bloom, a layer swap and the
   * hover lift are Web Animations; the endless glow and pulse never settle, so they do not count), and is what a
   * real pointer would hit at its centre.
   */
  private async settledCentre(bubble: Locator, enabled: boolean): Promise<{ x: number; y: number }> {
    return bubble.evaluate(
      (el, needEnabled) =>
        new Promise<{ x: number; y: number }>((resolve, reject) => {
          const deadline = performance.now() + 30_000;
          const look = () => {
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const x = r.x + r.width / 2;
            const y = r.y + r.height / 2;
            // The whole ring, not just this bubble: a layer swap staggers its bubbles in, and RingMenu ignores
            // navigation clicks until the last of them has landed - a bubble already at rest is not enough.
            const ring = el.closest('.ring-backdrop') ?? el;
            const animating = (() => {
              for (let n: Element | null = el; n; n = n.parentElement) {
                if (n.getAnimations().some((a) => a.effect?.getComputedTiming().iterations !== Infinity)) return true;
              }
              return ring.getAnimations({ subtree: true }).some((a) => a.effect?.getComputedTiming().iterations !== Infinity);
            })();
            const top = document.elementFromPoint(x, y);
            const box = `${r.x},${r.y},${r.width},${r.height}`;
            const ready =
              r.width > 0 &&
              r.height > 0 &&
              style.visibility !== 'hidden' &&
              !(needEnabled && (el as HTMLButtonElement).disabled) &&
              !animating &&
              top !== null &&
              el.contains(top);
            if (ready) resolve({ x, y });
            else if (performance.now() > deadline) reject(new Error(`ring bubble never became pointable (box ${box}, animating ${animating}, top ${top?.className})`));
            else requestAnimationFrame(look);
          };
          look();
        }),
      enabled,
    );
  }

  /**
   * Moves the real pointer onto a bubble's centre — what previews a building's
   * card (hover never navigates any more), and `steps` is what makes that a
   * genuine pointer traversal rather than a teleport the component's own
   * enter/leave handling can miss.
   */
  async hover(bubble: Locator): Promise<void> {
    const { x, y } = await this.settledCentre(bubble, false);
    await this.page.mouse.move(x, y, { steps: 3 });
  }

  /** Presses and releases the real pointer where it is - after `hover(bubble)`, that is a click on the bubble. */
  async press(): Promise<void> {
    await this.page.mouse.down();
    await this.page.mouse.up();
  }

  /** Moves the real pointer onto a bubble and clicks it — how the ring navigates (hover only previews). */
  async click(bubble: Locator): Promise<void> {
    const { x, y } = await this.settledCentre(bubble, true);
    await this.page.mouse.move(x, y, { steps: 3 });
    await this.press();
  }

  /** Root "Build" action → the build categories on the inner lane. */
  async openBuildCategories(): Promise<void> {
    await this.click(this.action('Build').first());
    await this.settledLayer();
  }

  /** A named category → its buildings on the outer lane. */
  async openCategory(label: string): Promise<void> {
    await this.click(this.category(label).first());
    await this.settledLayer();
  }

  /**
   * Waits for a layer change to finish. The outgoing layer leaves first (a short fade under reduced motion, which
   * this suite emulates), so right after a click the bubbles on screen can still be the previous layer's.
   */
  private async settledLayer(): Promise<void> {
    await expect(this.backdrop).not.toHaveAttribute('data-swapping');
  }

  /**
   * The first category, for the specs that only care about "whatever this
   * terrain offers" rather than a named one.
   */
  async openFirstCategory(): Promise<void> {
    await this.click(this.categoryBubbles.first());
    await this.settledLayer();
  }
}

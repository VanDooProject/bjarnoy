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
  /** The outer lane: the buildings inside the hovered category. */
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

  /** Waits for a ring to have opened at all. */
  async waitForOpen(): Promise<void> {
    await expect(this.bubbles.first()).toBeVisible();
  }

  /**
   * Moves the real pointer onto a bubble's centre — the ring drills in on
   * hover (see SettlementView's onRingHover), and `steps: 6` is what makes
   * that a genuine pointer traversal rather than a teleport the component's
   * own enter/leave handling can miss.
   */
  async hover(bubble: Locator): Promise<void> {
    await expect(bubble).toBeVisible();
    const rect = (await bubble.boundingBox())!;
    await this.page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 6 });
  }

  /** Root "Build" action → the build categories on the inner lane. */
  async openBuildCategories(): Promise<void> {
    await this.hover(this.action('Build').first());
  }

  /** A named category → its buildings on the outer lane. */
  async openCategory(label: string): Promise<void> {
    await this.hover(this.category(label).first());
  }

  /**
   * The first category, for the specs that only care about "whatever this
   * terrain offers" rather than a named one.
   */
  async openFirstCategory(): Promise<void> {
    await this.hover(this.categoryBubbles.first());
  }
}

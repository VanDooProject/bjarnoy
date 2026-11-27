import type { Page } from '@playwright/test';

/**
 * One `page.evaluate` per helper, for the common "ask the renderer one thing"
 * case. The renderer's own surface is typed once in `../globals.d.ts`
 * (`SettlementRendererHook`). An evaluate that mixes the renderer with other
 * in-browser logic stays an evaluate at its call site: splitting it into these
 * helpers would turn one round trip into several (see the cost model in
 * `e2e/AGENTS.md`).
 */

type Hex = { q: number; r: number };

/** Screen point of a hex's centre, by the renderer's own camera maths. */
export function hexCenterScreen(page: Page, hex: Hex): Promise<{ x: number; y: number }> {
  return page.evaluate((h) => window.__settlementRenderer().hexCenterScreen(h), hex);
}

/** Resolves once the renderer has actually drawn a frame (two rAFs do not imply a Pixi render). */
export function whenFrameRendered(page: Page): Promise<void> {
  return page.evaluate(() => window.__settlementRenderer().whenFrameRendered());
}

export function lastArmyOverlayFrame(page: Page): Promise<ArmyOverlayFrameSnapshot> {
  return page.evaluate(() => window.__settlementRenderer().lastArmyOverlayFrame());
}

export function cameraZoom(page: Page): Promise<number> {
  return page.evaluate(() => window.__settlementRenderer().cameraZoom);
}

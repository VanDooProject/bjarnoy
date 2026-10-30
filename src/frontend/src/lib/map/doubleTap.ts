// Touch double-tap-to-zoom — the browser's own double-tap zoom is gone on the
// map canvases (`touch-action: none` plus HexMapRenderer's touchstart
// preventDefault, which pinch needs), so the renderer recognises it itself.
//
// Its own module for the same reason as pinchGesture.ts: pure, DOM-free and
// testable under Vitest's Node environment. The renderer owns the timer and
// the camera; this only answers "does this tap pair count" and "how far
// along is the zoom animation".

export interface Point {
  x: number;
  y: number;
}

export interface Tap {
  /** Client coordinates of the tap. */
  at: Point;
  /** `performance.now()` at the tap's pointerup. */
  timeMs: number;
}

/**
 * How long a single touch tap is held back waiting for a second one. A touch
 * tap on the map only fires once this has passed without a second tap —
 * the price of telling a tap from the first half of a double tap.
 */
export const DOUBLE_TAP_MS = 250;
/** Max distance (CSS px) between the two taps of a double tap — about a fingertip. */
export const DOUBLE_TAP_SLOP_PX = 30;
/** Zoom factor one double tap applies, around the second tap's point. */
export const DOUBLE_TAP_ZOOM_FACTOR = 2;
/** Duration of the double-tap zoom animation. */
export const DOUBLE_TAP_ZOOM_MS = 220;

/** Whether `second` completes a double tap started by `first`. */
export function isDoubleTap(first: Tap, second: Tap): boolean {
  const dt = second.timeMs - first.timeMs;
  if (dt < 0 || dt > DOUBLE_TAP_MS) return false;
  return Math.hypot(second.at.x - first.at.x, second.at.y - first.at.y) <= DOUBLE_TAP_SLOP_PX;
}

/**
 * Log-zoom the animation should have applied by `elapsedMs` (ease-out cubic,
 * so it starts fast and settles). The renderer applies the difference to
 * what it already applied each frame as one `zoomBy` step, so the
 * world<->settlement threshold crossing in `zoomBy` fires exactly as it
 * does for a wheel or pinch.
 */
export function doubleTapZoomLog(elapsedMs: number, factor = DOUBLE_TAP_ZOOM_FACTOR, durationMs = DOUBLE_TAP_ZOOM_MS): number {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.log(factor) * eased;
}

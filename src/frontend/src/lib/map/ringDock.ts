// The touch / phone-layout variant of the ring's detail card: instead of
// floating next to the ring (there is no room for a 200px card beside a
// two-lane ring on a phone), the same card is docked to a screen edge —
// a full-width strip along the bottom in portrait, a full-height panel on
// the side AWAY from the tapped hex in landscape.
//
// Touch also has no hover, so building is two taps: the first "arms" a bubble
// (fills the dock), a second tap on the same armed bubble commits. Both rules
// live here, pure, so they can be unit-tested without a DOM.
import type { Rect } from './ringLayout';

export type RingDock = 'bottom' | 'left' | 'right';

/** Height the bottom strip is given room for (the ring keeps clear of it). */
export const DOCK_BOTTOM_H = 236;
/** Width of the landscape side panel. */
export const DOCK_SIDE_W = 248;
/** Gap between a dock and the screen edge / the ring. */
export const DOCK_GAP = 8;

export interface RingDockInput {
  /** The compact (phone) HUD layout is active — see HUD_COMPACT_QUERY. */
  compact: boolean;
  width: number;
  height: number;
  /** The tapped hex's screen x. */
  x: number;
  /** Space the HUD already occupies on the left edge (landscape rail, queue handle). */
  insetLeft?: number;
}

/** Where the card docks, or null for the floating desktop card. */
export function ringDockFor({ compact, width, height, x, insetLeft = 0 }: RingDockInput): RingDock | null {
  if (!compact) return null;
  if (height >= width) return 'bottom';
  // Landscape: the side with more room, which is the side away from the hex.
  return width - x >= x - insetLeft ? 'right' : 'left';
}

/**
 * The ring's bounds shrunk so the ring stays clear of the dock. Falls back to
 * the original bounds when what is left would be too small to hold a ring at
 * all — a ring overlapping the dock beats a ring squeezed into nothing.
 */
export function boundsClearOfDock(
  bounds: Rect,
  dock: RingDock | null,
  stage: { width: number; height: number; insetLeft?: number; insetBottom?: number },
  minSize = 180,
): Rect {
  if (!dock) return bounds;
  const next = { ...bounds };
  if (dock === 'bottom') next.bottom = Math.min(bounds.bottom, stage.height - (stage.insetBottom ?? 0) - DOCK_BOTTOM_H - DOCK_GAP);
  if (dock === 'right') next.right = Math.min(bounds.right, stage.width - DOCK_SIDE_W - 2 * DOCK_GAP);
  if (dock === 'left') next.left = Math.max(bounds.left, (stage.insetLeft ?? 0) + DOCK_SIDE_W + 2 * DOCK_GAP);
  if (next.right - next.left < minSize || next.bottom - next.top < minSize) return bounds;
  return next;
}

/**
 * One tap on a bubble: a tap on the bubble that is already armed commits it,
 * a tap on any other bubble moves the arm there (and does not commit).
 */
export function tapArm(armed: string | null, id: string): { armed: string; commit: boolean } {
  return armed === id ? { armed: id, commit: true } : { armed: id, commit: false };
}

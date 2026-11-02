// Canvas markers (construction dials, the settlement name badge) that sit
// beneath an open ring menu are faded out so they don't show through between
// and around the ring's DOM bubbles. Pure geometry + the fade tween; the
// renderer owns the per-marker state (HexMapRenderer.setMarkerOcclusion).

export interface OcclusionCircle {
  x: number;
  y: number;
  r: number;
}

export interface OcclusionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How long a marker takes to fade out/in when the ring opens/closes. */
export const MARKER_FADE_MS = 120;

/**
 * The ring's footprint: a circle at the ring centre reaching the far edge of
 * the farthest bubble (its centre distance plus its own radius). Never smaller
 * than the centre hub, so a ring with no bubbles still covers its middle.
 */
export function ringFootprint(
  center: { x: number; y: number },
  bubbles: readonly OcclusionCircle[],
  hubRadius = 0,
): OcclusionCircle {
  let r = hubRadius;
  for (const b of bubbles) r = Math.max(r, Math.hypot(b.x - center.x, b.y - center.y) + b.r);
  return { x: center.x, y: center.y, r };
}

export function circlesIntersect(a: OcclusionCircle, b: OcclusionCircle): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r;
}

export function circleIntersectsRect(c: OcclusionCircle, rect: OcclusionRect): boolean {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h));
  return Math.hypot(c.x - nx, c.y - ny) <= c.r;
}

/** Next visibility 0..1 of a marker: fades towards 0 while occluded, 1 otherwise; instant under reduced motion. */
export function markerFadeStep(visible: number, occluded: boolean, dtMs: number, reducedMotion: boolean): number {
  const target = occluded ? 0 : 1;
  if (reducedMotion) return target;
  const step = Math.max(0, dtMs) / MARKER_FADE_MS;
  return target > visible ? Math.min(target, visible + step) : Math.max(target, visible - step);
}

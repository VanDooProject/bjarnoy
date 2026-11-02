/**
 * Pure geometry for GuidancePointer.vue's arrow.
 *
 * landing-page-defects.md L2: `useMapAnchor` (and the `screen` prop's own
 * watchEffect) write the TARGET's screen position into `--anchor-x/-y`, and
 * `.anchor` centres its box on that point with `translate(-50%, -50%)`. That
 * places the centre of the 110×110 arrow SVG's bounding box on the target —
 * not the arrowhead's tip, which sits well below that centre. Once `.rotate`
 * turns the whole thing by `angle`, the tip lands rotated-out to one side of
 * the target instead of on it (worked example in the doc: at 38° the tip
 * ends up ~(-27.5, +35.2)px off, which at the preview camera's zoom is a
 * full tile away).
 *
 * The fix kept here as pure, testable functions: figure out how far the
 * offset needs to shift the arrow, *after* rotation, so the tip lands back
 * on the target (minus a small standoff so it hovers just off it rather
 * than sitting exactly on top). GuidancePointer.vue applies the result as a
 * `translate()` on a wrapper around (not inside) the `.rotate` element, so
 * the rotation itself — and the bob keyframe nested inside it, which is what
 * makes the bob read as "along the shaft" at any angle — is untouched.
 */

import { BUB1, type Circle, type Rect } from './ringLayout';

/** The arrow's `<svg>` viewBox is a `0 0 ARROW_VIEWBOX_SIZE ARROW_VIEWBOX_SIZE` square — see the `<svg viewBox="0 0 150 150">` markup. */
export const ARROW_VIEWBOX_SIZE = 150;

/** The arrowhead's tip, as the `y` of the `<polygon>`'s first point (`"75,136 ..."`) in viewBox units. */
export const ARROW_TIP_VIEWBOX_Y = 136;

/** The `<svg>` is rendered at this many px square (its `width`/`height` attributes). */
export const ARROW_RENDERED_SIZE = 110;

/**
 * Distance, in rendered px, from the SVG's own centre — the point both
 * `.anchor`'s `translate(-50%, -50%)` and `.rotate`'s default
 * `transform-origin` pivot on — to the arrowhead's tip. Derived from the
 * viewBox numbers above rather than hardcoded, so a future change to the
 * arrow artwork (a taller/shorter head) can't silently desync this from the
 * shape it describes.
 */
export const ARROW_TIP_DISTANCE_PX =
  ((ARROW_TIP_VIEWBOX_Y - ARROW_VIEWBOX_SIZE / 2) * ARROW_RENDERED_SIZE) / ARROW_VIEWBOX_SIZE;

/**
 * How far short of the target's own edge the tip should stop, so it hovers
 * just off the thing it points at instead of sitting on top of it
 * (landing-page-defects.md L2).
 *
 * This is a gap past the target's *radius*, not a distance from its centre.
 * The distinction is the whole bug in the first revision of this module: a
 * flat 9px from centre reads correctly against a hex (a preview-zoom top
 * face is only ~30px tall, so 9px short of centre still lands on it) but is
 * far inside a ring-menu bubble, whose radius is 26px (`ringLayout.BUB1` is
 * a 52px diameter) — the tip stopped 17px *within* the bubble's edge and
 * the shaft covered the bubble completely, hiding the very label it was
 * meant to be singling out.
 */
export const ARROW_TIP_GAP_PX = 9;

/**
 * Radius of the thing being pointed at, for the two anchor modes
 * GuidancePointer supports.
 *
 * A hex is deliberately 0: the pointer anchors to `hexCenterScreen`, and a
 * hex's on-screen size changes with zoom, so there is no fixed radius to
 * clear — stopping a small gap short of the centre is what actually reads
 * as "this one" at any zoom, and is what the map screens were already
 * tuned to. A ring bubble has a genuinely fixed size in screen px, so its
 * own radius is the right thing to clear.
 */
export const HEX_TARGET_RADIUS_PX = 0;

/**
 * Derived from `ringLayout`'s own inner-lane bubble diameter rather than
 * written out as a number, so resizing the ring can't silently leave the
 * pointer aiming at where the bubbles used to end. (`ringLayout` imports
 * nothing, so this direction of dependency introduces no cycle.)
 */
export const RING_BUBBLE_TARGET_RADIUS_PX = BUB1 / 2;

/** Total distance from the target's centre at which the tip should stop. */
export function tipStandoffFor(targetRadiusPx: number): number {
  return targetRadiusPx + ARROW_TIP_GAP_PX;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Where the tip ends up, relative to the SVG's own (unrotated) centre, once
 * `.rotate` turns the arrow by `angleDeg` about that centre — i.e. the
 * offset the arrow has *without* the fix below applied. CSS's `rotate()` is
 * a standard rotation matrix, but because screen-space y grows downward a
 * positive angle reads as clockwise; this mirrors that (screen-space x/y,
 * not math-space).
 *
 * Exported for the unit test's "anchor + offset + rotatedTipVector ≈
 * anchor" check; the component itself has no direct use for the un-offset
 * tip position.
 */
export function rotatedTipVector(angleDeg: number, scale = 1): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: -ARROW_TIP_DISTANCE_PX * scale * Math.sin(rad),
    y: ARROW_TIP_DISTANCE_PX * scale * Math.cos(rad),
  };
}

/**
 * The screen-space `translate()` to compose with `rotate(angleDeg)` — as
 * `translate(...) rotate(...)`, so the rotation runs first and this shift
 * lands in already-rotated (screen) space — so the arrow's tip ends up
 * `tipStandoffFor(targetRadiusPx)` short of the anchor point, along the
 * shaft's own axis, at any angle.
 *
 * `targetRadiusPx` is how big the thing under the anchor point is, so the
 * tip clears its edge rather than burying itself in the middle of it — see
 * `ARROW_TIP_GAP_PX`. Defaults to a point target (a hex), which is what
 * every map-anchored screen uses.
 *
 * The trig only needs to run once per render (not per frame — `angle` is a
 * static prop per pointer target, unlike the anchor position itself, which
 * `useMapAnchor` updates every animation frame directly via style props
 * rather than through Vue reactivity for exactly that cost reason).
 */
export function arrowTipOffset(
  angleDeg: number,
  targetRadiusPx = HEX_TARGET_RADIUS_PX,
  gapPx = ARROW_TIP_GAP_PX,
  scale = 1,
): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  // PLUS the standoff, not minus. The tip has to stop on the side the arrow
  // approaches from; subtracting put it the standoff distance *past* the
  // anchor, along the very direction the arrow points — so the arrow flew
  // over its target and indicated a spot beyond it. At the old flat 9px
  // against a hex that was too small to notice, which is how it survived;
  // scaling the standoff to a ring bubble's 26px radius made it obvious
  // (the arrow cleared the bubble and pointed past its far edge).
  const shift = ARROW_TIP_DISTANCE_PX * scale + targetRadiusPx + gapPx;
  return {
    x: shift * Math.sin(rad),
    y: -shift * Math.cos(rad),
  };
}

/** The arrow bobs this far back along its shaft (GuidancePointer's `pointer-bob` keyframe, `translateY(-14px)`). */
export const ARROW_BOB_PX = 14;

/** A ring-bubble target's arrow tip rests this far outside the bubble's rim (at the bob's nearest point). */
export const RING_TIP_GAP_PX = 4;

/** The label inside a ring bubble, as a fraction of its diameter (width, height): text is capped well inside the rim. */
export const BUBBLE_LABEL_BOX = { w: 0.84, h: 0.5 } as const;

/** Clearance kept between the arrow and every other bubble (the arrow's own outline stroke is ~3px wide). */
const ARROW_CLEARANCE_PX = 3;

const SCALE = ARROW_RENDERED_SIZE / ARROW_VIEWBOX_SIZE;
/** Arrow outline in the shaft's own frame: `s` runs from the tip back along the shaft, `w` is across it. */
const HEAD_LEN = (ARROW_TIP_VIEWBOX_Y - 72) * SCALE;
const HEAD_HALF_WIDTH = 43 * SCALE;
const SHAFT_HALF_WIDTH = 15 * SCALE;
const ARROW_LENGTH = (ARROW_TIP_VIEWBOX_Y - 14) * SCALE;

/** The arrow's two convex pieces (head triangle, shaft rectangle) once placed with its tip at `tip`, tail towards `tail`. */
export function arrowPieces(tip: Vec2, tail: Vec2, scale = 1): Vec2[][] {
  const at = (s: number, w: number): Vec2 => ({
    x: tip.x + (tail.x * s - tail.y * w) * scale,
    y: tip.y + (tail.y * s + tail.x * w) * scale,
  });
  return [
    [at(0, 0), at(HEAD_LEN, -HEAD_HALF_WIDTH), at(HEAD_LEN, HEAD_HALF_WIDTH)],
    [at(HEAD_LEN, -SHAFT_HALF_WIDTH), at(ARROW_LENGTH, -SHAFT_HALF_WIDTH), at(ARROW_LENGTH, SHAFT_HALF_WIDTH), at(HEAD_LEN, SHAFT_HALF_WIDTH)],
  ];
}

/** The arrow pieces at the bob's nearest, middle and farthest positions (it slides back along the shaft). */
function bobbedPieces(tip: Vec2, tail: Vec2, scale: number): Vec2[][] {
  return [0, ARROW_BOB_PX / 2, ARROW_BOB_PX].flatMap((back) =>
    arrowPieces({ x: tip.x + tail.x * back * scale, y: tip.y + tail.y * back * scale }, tail, scale),
  );
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** How far a convex polygon reaches into a circle (0 when clear); the full radius when the centre is inside. */
export function polygonCirclePenetration(poly: readonly Vec2[], c: Circle): number {
  let nearest = Infinity;
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    nearest = Math.min(nearest, distanceToSegment(c, a, b));
    const side = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (side > 0) positive++;
    else if (side < 0) negative++;
  }
  // On the same side of every edge: the centre is inside the convex polygon.
  if (positive === 0 || negative === 0) return c.r;
  return Math.max(0, c.r - nearest);
}

/** Do two convex polygons overlap (separating-axis test)? */
export function convexPolygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = { x: q.y - p.y, y: p.x - q.x };
      const project = (pts: readonly Vec2[]) => pts.map((v) => v.x * axis.x + v.y * axis.y);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** The text area of a ring bubble, as a rectangle polygon. */
export function bubbleLabelRect(c: Circle): Vec2[] {
  const hw = c.r * BUBBLE_LABEL_BOX.w;
  const hh = c.r * BUBBLE_LABEL_BOX.h;
  return [
    { x: c.x - hw, y: c.y - hh },
    { x: c.x + hw, y: c.y - hh },
    { x: c.x + hw, y: c.y + hh },
    { x: c.x - hw, y: c.y + hh },
  ];
}

/** Total trouble of an arrow placement: px outside `bounds` plus px reached into any bubble. 0 means it fits. */
function placementPenalty(pieces: Vec2[][], bounds: Rect, bubbles: readonly Circle[]): number {
  let penalty = 0;
  for (const poly of pieces) {
    for (const v of poly) {
      penalty += Math.max(0, bounds.left - v.x) + Math.max(0, v.x - bounds.right);
      penalty += Math.max(0, bounds.top - v.y) + Math.max(0, v.y - bounds.bottom);
    }
    for (const b of bubbles) penalty += polygonCirclePenetration(poly, { ...b, r: b.r + ARROW_CLEARANCE_PX });
  }
  return penalty;
}

/** Angle search resolution, and how far round the arrow may swing from the radial approach. */
const AIM_STEP_DEG = 5;

/** Arrow sizes to try, full size first: on a cramped ring no angle may fit the full arrow, a smaller one still points. */
export const ARROW_SCALES = [1, 0.8, 0.65] as const;

/**
 * The arrow's rotation (plus the radius/gap `GuidancePointer` needs) for pointing at one ring bubble. One rule for
 * every bubble on every screen: the arrow's tip rests `RING_TIP_GAP_PX` outside the bubble's rim, so it singles the
 * bubble out without covering its label, and approaches radially from the side facing away from the hub (outside the
 * ring, where no other bubble is). If that would put any of the arrow (through its whole bob) outside `bounds` or over
 * another bubble, the approach swings round the bubble, the angles nearest the radial one first, to the first that
 * fits; if no angle fits the full-size arrow it is tried smaller (`ARROW_SCALES`), and the least-bad placement is
 * the last resort.
 */
export function ringBubbleAim(
  hub: Vec2,
  target: Circle,
  others: readonly Circle[],
  bounds: Rect,
): { angle: number; scale: number; targetRadius: number; gap: number } {
  // Bubbles stacked on the same centre (a lone Build bubble sits on the hub on a cramped ring) are one thing to the
  // eye: the arrow points at the rim of the biggest, and neither of them is "another bubble" to keep clear of.
  const stacked = others.filter((o) => Math.hypot(o.x - target.x, o.y - target.y) < 1);
  const aimed: Circle = { ...target, r: Math.max(target.r, ...stacked.map((o) => o.r)) };
  const dx = target.x - hub.x;
  const dy = target.y - hub.y;
  const len = Math.hypot(dx, dy);
  // The arrow's tail points along `outward` and its tip against it; at rotation `angle` the tail is (sin, -cos).
  const outward = len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: -1 };
  const radial = (Math.atan2(outward.x, -outward.y) * 180) / Math.PI;
  const distance = aimed.r + RING_TIP_GAP_PX;
  const avoid = others.filter((o) => !stacked.includes(o));
  let best = { angle: radial, scale: 1, penalty: Infinity };
  for (const scale of ARROW_SCALES) {
    for (let k = 0; k <= 360 / AIM_STEP_DEG / 2; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const angle = radial + sign * k * AIM_STEP_DEG;
        const rad = (angle * Math.PI) / 180;
        const tail = { x: Math.sin(rad), y: -Math.cos(rad) };
        const tip = { x: aimed.x + tail.x * distance, y: aimed.y + tail.y * distance };
        const penalty = placementPenalty(bobbedPieces(tip, tail, scale), bounds, avoid);
        if (penalty === 0) return { angle, scale, targetRadius: aimed.r, gap: RING_TIP_GAP_PX };
        if (penalty < best.penalty) best = { angle, scale, penalty };
      }
    }
  }
  return { angle: best.angle, scale: best.scale, targetRadius: aimed.r, gap: RING_TIP_GAP_PX };
}

/** Where the arrow's tip ends up on screen for a pointer anchored at `anchor` (the maths GuidancePointer applies). */
export function arrowTipPoint(anchor: Vec2, angleDeg: number, targetRadiusPx: number, gapPx = ARROW_TIP_GAP_PX, scale = 1): Vec2 {
  const shift = arrowTipOffset(angleDeg, targetRadiusPx, gapPx, scale);
  const tip = rotatedTipVector(angleDeg, scale);
  return { x: anchor.x + shift.x + tip.x, y: anchor.y + shift.y + tip.y };
}

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

import { BUB1 } from './ringLayout';

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
export function rotatedTipVector(angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: -ARROW_TIP_DISTANCE_PX * Math.sin(rad),
    y: ARROW_TIP_DISTANCE_PX * Math.cos(rad),
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
export function arrowTipOffset(angleDeg: number, targetRadiusPx = HEX_TARGET_RADIUS_PX): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  // PLUS the standoff, not minus. The tip has to stop on the side the arrow
  // approaches from; subtracting put it the standoff distance *past* the
  // anchor, along the very direction the arrow points — so the arrow flew
  // over its target and indicated a spot beyond it. At the old flat 9px
  // against a hex that was too small to notice, which is how it survived;
  // scaling the standoff to a ring bubble's 26px radius made it obvious
  // (the arrow cleared the bubble and pointed past its far edge).
  const shift = ARROW_TIP_DISTANCE_PX + tipStandoffFor(targetRadiusPx);
  return {
    x: shift * Math.sin(rad),
    y: -shift * Math.cos(rad),
  };
}

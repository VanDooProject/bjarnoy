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
 * How far short of the target the tip should stop, so it hovers just off
 * the hex/bubble instead of sitting exactly on its centre (which reads
 * better, and stops the shaft covering the glow it's meant to be pointing
 * at — landing-page-defects.md L2).
 */
export const ARROW_TIP_STANDOFF_PX = 9;

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
 * `ARROW_TIP_STANDOFF_PX` short of the anchor point, along the shaft's own
 * axis, at any angle.
 *
 * The trig only needs to run once per render (not per frame — `angle` is a
 * static prop per pointer target, unlike the anchor position itself, which
 * `useMapAnchor` updates every animation frame directly via style props
 * rather than through Vue reactivity for exactly that cost reason).
 */
export function arrowTipOffset(angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const shift = ARROW_TIP_DISTANCE_PX - ARROW_TIP_STANDOFF_PX;
  return {
    x: shift * Math.sin(rad),
    y: -shift * Math.cos(rad),
  };
}

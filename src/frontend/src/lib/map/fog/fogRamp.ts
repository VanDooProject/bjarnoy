// The fog mist's ramp constants, kept apart from fogShader.ts (which pulls in pixi) so pixi-free code can read them.

/**
 * Width, in ramp units, of the taper that closes the edge-noise window past
 * each tier's `reach` (see edgeBand). Exported and interpolated into the
 * GLSL below rather than written twice, because the renderer derives its
 * terrain cull radius from where this window shuts: past that point the mist
 * is provably fully opaque, and drawing ground under it is wasted fill.
 */
export const EDGE_NOISE_FADE_RAMP = 0.25;

/**
 * Where each tier's edge noise starts tapering off, reaching zero at the end
 * of the ramp — [unknown, outOfSight], and independent of where the tier's
 * opacity saturates (see fogShader.ts's edgeBand). 0.55 of the mist's ramp
 * is 7.7 hexes, so wisps keep thinning otherwise-solid mist for nearly two
 * hexes past the point it has gone opaque, shut off entirely by 11.2 — that
 * outer stretch is where the faintest, roundest part of the fluff lives,
 * and it is the reason the ramp is fourteen hexes wide rather than the ten
 * it used to be. Where it shuts also sets how far terrain has to be drawn,
 * so pushing it further out is not free.
 */
export const NOISE_REACH: [number, number] = [0.55, 0.7];

/**
 * The ramp value past which the mist's edge noise is fully shut off, and so
 * the mist is provably opaque — NOISE_REACH plus the taper that closes it.
 * HexMapRenderer derives its terrain cull radius from this: ground past it
 * cannot show through, so drawing it is pure waste, and on a software
 * renderer that waste measured about 30ms a frame.
 */
export const FOG_MIST_OPAQUE_AT_RAMP = NOISE_REACH[0] + EDGE_NOISE_FADE_RAMP;

/**
 * The troop's white (unknown) ramp, in hexes past its vision radius: starts `ARMY_FOG_WHITE_OFFSET` out and fades over
 * `ARMY_FOG_WHITE_MARGIN` (fogShader.ts's armyRamps). The server bakes the same ramp around explored ground
 * (`FogMaskGenerator.TrailFringeOffsetHexes` / `TrailFringeMarginHexes`, which must equal these), so a stored trail reads
 * like the live clearing.
 */
export const ARMY_FOG_WHITE_OFFSET = 0.75;
export const ARMY_FOG_WHITE_MARGIN = 6;

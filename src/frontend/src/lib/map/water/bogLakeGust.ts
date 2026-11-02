// The wind gust that travels over the bog lakes — docs/design/water-shader.md, "Bog lakes — gusts in step with the forest".
//
// The forests sway in a wave: each tree's phase is `frame / period - s / wavelength` (s = position along screen-right in render
// units, see `AtlasClip.sway`), and `HexMapRenderer.syncTopAnim` plays the tile in map column `col` at frame
// `(g - framesPerColumn * col) mod period`, `g = floor(animClockMs * fps / 1000)`. The tile's art canvas starts at
// `isoGridPosition(coord).x = col * 0.75 * tileW`, one render unit is `tileW / 2` world units, so in world space the very same wave is
// continuous: `phase(x, t) = t * fps / period - (x / (tileW / 2)) / wavelength`. That is `gustPhase`; the shader mirrors it, so the
// ripples on a lake and the lean of the trees next to it share one gust.

/** Frames per second of the forest sway clips (`shared_clock: true` in the atlas). */
export const GUST_FPS = 6;
/** Frames in one gust period of a sway clip (`swayPeriodFrames` of `GUST_SWAY`). */
export const GUST_PERIOD_FRAMES = 16;
/** Map columns a sway clip's frame offset advances per column (`sway.frames_per_column`). */
export const GUST_FRAMES_PER_COLUMN = 4;
/** The gust's wavelength in render units (`sway.wavelength`). */
export const GUST_WAVELENGTH = 6;

/** The forests' sway metadata as the atlas clips carry it (`AtlasClip.sway`); the tests pin the constants above to it. */
export const GUST_SWAY = { wavelength: GUST_WAVELENGTH, frames_per_column: GUST_FRAMES_PER_COLUMN } as const;

/**
 * The phase (fraction of the period) at which the forest leans furthest: measured from the forest_mixed / forest_taiga SE sway frames'
 * lean (centroid shift fundamental). The gust's peak sits where `fract(gustPhase) === GUST_PEAK_PHASE`.
 */
export const GUST_PEAK_PHASE = 0.34;

/**
 * The lake gust's shift against that lean, in periods: -2 sway frames, chosen by eye in the bog lake lab (the band reads as in step
 * slightly ahead of the measured furthest lean). The debug panel's phase offset starts here.
 */
export const GUST_LAKE_PHASE_OFFSET = -2 / 16;

/** The time term of the gust phase, in periods, wrapped to [0, 1): what the shader gets as `uGustTime` (small, so float32 keeps its precision). */
export function gustTime(clockMs: number): number {
  const t = (clockMs / 1000) * (GUST_FPS / GUST_PERIOD_FRAMES);
  return t - Math.floor(t);
}

/**
 * The gust phase (in periods, not wrapped) at world x `worldX` and clock `clockMs` (`animClockMs`): the wave travels toward +x. Continuous in
 * time — the forest steps through its frames at `GUST_FPS`, this does not.
 */
export function gustPhase(worldX: number, clockMs: number, tileW: number): number {
  return (clockMs / 1000) * (GUST_FPS / GUST_PERIOD_FRAMES) - worldX / (tileW / 2) / GUST_WAVELENGTH;
}

/** How far (in periods, -0.5..0.5) `phase` is from the gust's peak; 0 at the peak of the lean. */
export function gustOffset(phase: number): number {
  const d = phase - GUST_PEAK_PHASE;
  return d - Math.floor(d + 0.5);
}

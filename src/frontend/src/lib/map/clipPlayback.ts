// Pure playback math for a `buildings-anim` clip (see `atlas.ts`'s
// `AtlasClip`): which frame index to show at a given elapsed time, given
// the clip's own fps/playback/pause. Shared by every clip player so this
// exists in exactly one place — `AnimatedBuildingSprite.vue` (one sprite,
// driven by its own `setInterval`) and the Wasted Lands docs page's giant
// previews (`WastedIsland.vue`/`AnimatedGiant.vue`, several sprites sharing
// one clock — see `useAnimationClock.ts`).
//
// `pause` (seconds of extra dwell the atlas manifest tacks onto the end of
// its own cycle) is spent holding the loop's last frame — a pingpong clip's
// own cycle already ends back at frame 0 (it bounced there and is about to
// head into frame 1 of the next cycle), so its `pause` just delays that next
// upswing rather than holding a distinct "turnaround" frame.

/** The subset of `AtlasClip` this module's math needs, plus the clip's own resolved frame count in place of a frame-name array — kept structural so a caller with `frameRects` can pass a light view of it without importing `AtlasClip` itself. */
export interface ClipTiming {
  frameCount: number;
  fps: number;
  playback: 'loop' | 'pingpong';
  pause: number;
}

/** `ClipTiming` from a resolved clip (`findAtlasClip`'s/`resolveIslandClip`'s return shape) — the small adapter every call site would otherwise repeat. */
export function clipTimingOf(clip: {
  frameRects: unknown[];
  fps: number;
  playback: 'loop' | 'pingpong';
  pause: number;
}): ClipTiming {
  return {
    frameCount: clip.frameRects.length,
    fps: clip.fps,
    playback: clip.playback,
    pause: clip.pause,
  };
}

/** Total steps (frame-lengths) in one full cycle, including the held `pause` tail. */
function stepsPerCycle(clip: ClipTiming): number {
  const n = clip.frameCount;
  const pauseSteps = Math.round(clip.pause * clip.fps);
  return (clip.playback === 'pingpong' ? Math.max(1, n * 2 - 2) : n) + pauseSteps;
}

/** The frame index for a step already known to be within `[0, stepsPerCycle(clip))`. */
function frameIndexAtStep(clip: ClipTiming, step: number): number {
  const n = clip.frameCount;
  if (n === 0) return 0;
  if (clip.playback === 'pingpong') {
    const cycle = Math.max(1, n * 2 - 2);
    const s = step % cycle;
    return s < n ? s : cycle - s;
  }
  return Math.min(step, n - 1);
}

/**
 * The clip frame to show `elapsedMs` after playback started. `elapsedMs` is
 * floored to whole frame-steps at the clip's own fps (frames don't
 * interpolate) before being folded into the loop/pingpong cycle — the same
 * `position`/`frameIndexAt` math `AnimatedBuildingSprite.vue` used to keep
 * inline, now shared.
 */
export function clipFrameIndex(clip: ClipTiming, elapsedMs: number): number {
  if (clip.frameCount <= 0) return 0;
  const total = stepsPerCycle(clip);
  const step = Math.floor(elapsedMs / (1000 / clip.fps)) % total;
  return frameIndexAtStep(clip, step);
}

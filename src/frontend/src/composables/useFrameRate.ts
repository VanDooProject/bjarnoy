// A real frame-rate sample — what the last second actually looked like, not
// what it looked like on average.
//
// WaterPerfPanel already measures a frame interval, deliberately as a *median*
// over sixty frames: it exists to give `runPerfSweep` a baseline that one long
// frame can't drag around. That is the right number for the sweep and the
// wrong one for "is the map smooth", because a stutter *is* the outlier a
// median is built to discard — a map that rebuilt for 500ms and then ran nine
// clean frames still reported 60 fps. Both numbers are worth having; they are
// not the same number, so this is not shared with that panel.
//
// Sampled with requestAnimationFrame rather than Pixi's ticker so it measures
// the interval the display actually presented at, including the frames the
// renderer never got to start.
import { onUnmounted, reactive } from 'vue';

export interface FrameRateSample {
  /** Mean fps over `RECENT_MS` — what it feels like right now. */
  fps: number;
  /** Mean frame interval over the same window. */
  frameMs: number;
  /** The longest single frame in the last `WINDOW_MS`, in ms. A stall's actual size. */
  worstMs: number;
  /** How long ago that worst frame was, in seconds — so an old spike visibly ages out instead of looking current. */
  worstAgoS: number;
  /** Frames over `STUTTER_MS` in the last `WINDOW_MS`. */
  stutters: number;
  /** The last `SPARK_FRAMES` intervals, oldest first, for the sparkline. */
  recent: number[];
}

/** The window "right now" is averaged over. Short enough to track a gesture, long enough not to jitter. */
const RECENT_MS = 500;
/** The window the worst frame and the stutter count are taken over. */
const WINDOW_MS = 3000;
/**
 * What counts as a dropped frame. Two 60Hz frames — below this a frame is late
 * but the motion still reads as continuous, above it the eye sees a hitch.
 */
const STUTTER_MS = 33;
const SPARK_FRAMES = 90;

export function useFrameRate(): FrameRateSample {
  const sample = reactive<FrameRateSample>({
    fps: 0,
    frameMs: 0,
    worstMs: 0,
    worstAgoS: 0,
    stutters: 0,
    recent: [],
  });

  // Parallel arrays of interval and the timestamp it ended at, trimmed to
  // WINDOW_MS — a ring of a few hundred numbers, so the meter itself never
  // becomes something the profile has to account for.
  const intervals: number[] = [];
  const stamps: number[] = [];
  let last = 0;
  let raf = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (last) {
      intervals.push(now - last);
      stamps.push(now);
    }
    last = now;
    while (stamps.length && now - stamps[0] > WINDOW_MS) {
      stamps.shift();
      intervals.shift();
    }
    if (!intervals.length) return;

    let recentSum = 0;
    let recentCount = 0;
    let worst = 0;
    let worstAt = now;
    let stutters = 0;
    for (let i = 0; i < intervals.length; i++) {
      const d = intervals[i];
      if (now - stamps[i] <= RECENT_MS) {
        recentSum += d;
        recentCount++;
      }
      if (d > worst) {
        worst = d;
        worstAt = stamps[i];
      }
      if (d > STUTTER_MS) stutters++;
    }
    // A window shorter than RECENT_MS (the first half-second, or a tab that
    // was just brought back) has no recent frames of its own to average.
    const mean = recentCount ? recentSum / recentCount : intervals[intervals.length - 1];
    sample.frameMs = mean;
    sample.fps = mean > 0 ? 1000 / mean : 0;
    sample.worstMs = worst;
    sample.worstAgoS = (now - worstAt) / 1000;
    sample.stutters = stutters;
    sample.recent = intervals.slice(-SPARK_FRAMES);
  };

  raf = requestAnimationFrame(tick);
  onUnmounted(() => cancelAnimationFrame(raf));

  return sample;
}

export const STUTTER_THRESHOLD_MS = STUTTER_MS;
export const FRAME_WINDOW_MS = WINDOW_MS;

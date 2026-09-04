// An automated A/B sweep over the render flags, so "what is making this slow?"
// has an answer instead of a shrug.
//
// The honest constraint first, because it shapes everything here: attributing
// GPU time to one effect needs a timer query, and this codebase has no plumbing
// for one (FogPerfPanel leaves `shaderPassMs` off for the same reason). What it
// *can* do is what a person does by hand — turn one thing off, watch the frame
// interval, turn it back on — and that is exactly how docs/design/water-shader.md
// §4.2d's numbers were obtained. This automates that loop and reports the noise
// alongside the answer, which is the part a person doing it by eye skips.
//
// So every number out of here is a wall-clock difference between two states of
// the real renderer, never a model of one. Three consequences worth stating
// where they cannot be missed, since they are what makes such a measurement
// easy to over-read:
//
//   1. **The rows do not add up, and are not meant to.** Each is its own A/B
//      against the same baseline. The water layer's fixed cost — rasterising and
//      blending one full-viewport quad, ~84ms of its ~99ms under a software
//      rasteriser — is paid the moment the mesh is drawn at all, so it lands in
//      the whole-layer row and in none of the per-effect ones.
//   2. **A nested row overlaps its parent.** Turning the surface pattern off
//      takes all three caustic nets with it, so its delta already contains
//      theirs.
//   3. **A delta below the noise is not a measurement.** Frame intervals are not
//      quiet, especially under a software rasteriser sharing two cores with the
//      rest of the machine, so each sample carries its own dispersion and the
//      baseline is taken twice to catch drift. A row smaller than either is
//      reported as unresolved rather than as a small number — and so is a row
//      that came out *negative*, which the first run of this against the real
//      renderer promptly produced (a "+15.8 ms" surface pattern). Switching work
//      off cannot make a renderer slower, so such a row has measured the machine
//      and not the effect.

/** One sample of the frame clock: the middle of the distribution, and how wide it was. */
export interface FrameSample {
  /**
   * Median frame interval in ms. Median rather than mean throughout: one long
   * frame — a re-bake, a texture upload, the tab losing focus for a moment —
   * drags a mean around and says nothing about what a frame normally costs.
   */
  medianMs: number;
  /**
   * Median absolute deviation of the same intervals. This is the sample's own
   * noise floor, and the reason it is carried rather than discarded: a 2ms
   * difference between two samples that each wobble by 15ms is not a finding,
   * and without this figure it looks exactly like one.
   */
  madMs: number;
  /** How many intervals went into it. Small samples are the norm here — a software rasteriser at 250ms/frame gives four a second. */
  frames: number;
}

/** Something that can be switched off for the length of one sample. */
export interface SweepSubject {
  key: string;
  label: string;
  /** False if the user already has it off — sweeping it would measure nothing and report that as "free". */
  enabled(): boolean;
  disable(): void;
  restore(): void;
  /** A sub-effect of the row above: its delta is contained in that row's, not additional to it. */
  nested?: boolean;
}

export interface SweepRow {
  key: string;
  label: string;
  nested: boolean;
  /** Not measured, because it was already off when the sweep started. */
  skipped: boolean;
  /** Median frame interval with this subject disabled, ms. */
  offMs: number;
  /** baseline − offMs: what having it on costs per frame, in ms. */
  deltaMs: number;
  /** The dispersion this delta has to clear to mean anything — the wider of the two samples' MADs, and the baseline drift. */
  noiseMs: number;
  /**
   * True when `deltaMs <= noiseMs`: the sweep could not tell this effect's cost
   * from the frame clock's own wobble.
   *
   * Note the one-sided comparison. A *negative* delta — the frame got faster
   * with the effect still on — is not a small measurement to be reported with a
   * sign, it is a non-result: switching work off cannot make a renderer slower,
   * so a row that comes out that way has measured the machine rather than the
   * effect. It gets the same treatment as one that came out too small.
   */
  unresolved: boolean;
}

export interface SweepResult {
  /** Mean of the two baseline samples, which is what every delta is taken against. */
  baselineMs: number;
  /**
   * How far the second baseline landed from the first. This is the sweep's own
   * error bar: the machine getting busier halfway through moves every row after
   * it, and a drift larger than the deltas means the run should be repeated
   * rather than read.
   */
  driftMs: number;
  rows: SweepRow[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation — a spread that one outlying frame cannot inflate, unlike a standard deviation. */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function summarise(intervals: number[]): FrameSample {
  return { medianMs: median(intervals), madMs: medianAbsoluteDeviation(intervals), frames: intervals.length };
}

/**
 * Collect frame intervals from requestAnimationFrame until `frames` of them or
 * `maxMs` have gone by, whichever comes first.
 *
 * Both bounds are needed and neither alone is enough: on a GPU at 60fps a fixed
 * duration collects hundreds of samples nobody needs, and under a software
 * rasteriser a fixed count of them can take half a minute. `warmup` intervals
 * are dropped from the front, because the frame that first draws a changed flag
 * pays for the state change (a uniform upload, a mesh added to the stage) rather
 * than for the effect being measured.
 */
export function sampleFrames(
  { frames = 24, maxMs = 3_000, warmup = 2 } = {},
  raf: typeof requestAnimationFrame = requestAnimationFrame,
  now: () => number = () => performance.now(),
): Promise<FrameSample> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    const startedAt = now();
    let last = 0;
    let seen = 0;
    const step = () => {
      const t = now();
      if (last) {
        seen++;
        if (seen > warmup) intervals.push(t - last);
      }
      last = t;
      if (intervals.length >= frames || t - startedAt >= maxMs) resolve(summarise(intervals));
      else raf(step);
    };
    raf(step);
  });
}

/**
 * Baseline, then one sample per subject with that subject switched off, then a
 * second baseline.
 *
 * The sampler is injected rather than called directly so this is testable
 * without a browser or a clock: the interesting behaviour here is the ordering
 * and the restore discipline (a subject is off for its own sample and for
 * nothing else, and comes back on even if sampling throws), not the arithmetic.
 */
export async function runPerfSweep(
  subjects: SweepSubject[],
  sample: () => Promise<FrameSample>,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<SweepResult> {
  const live = subjects.filter((s) => s.enabled());
  const total = live.length + 2;
  let done = 0;

  const step = async (label: string): Promise<FrameSample> => {
    onProgress?.(done, total, label);
    const result = await sample();
    done += 1;
    onProgress?.(done, total, label);
    return result;
  };

  const first = await step('baseline');

  const measured = new Map<string, FrameSample>();
  for (const subject of live) {
    subject.disable();
    try {
      measured.set(subject.key, await step(subject.label));
    } finally {
      // Always: a sweep that threw halfway and left the water switched off
      // would look like a bug in the feature rather than in the sweep.
      subject.restore();
    }
  }

  const last = await step('baseline');
  const baselineMs = (first.medianMs + last.medianMs) / 2;
  const driftMs = Math.abs(last.medianMs - first.medianMs);

  const rows = subjects.map((subject): SweepRow => {
    const off = measured.get(subject.key);
    if (!off) {
      return {
        key: subject.key,
        label: subject.label,
        nested: subject.nested ?? false,
        skipped: true,
        offMs: 0,
        deltaMs: 0,
        noiseMs: 0,
        unresolved: false,
      };
    }
    const deltaMs = baselineMs - off.medianMs;
    const noiseMs = Math.max(first.madMs, last.madMs, off.madMs, driftMs);
    return {
      key: subject.key,
      label: subject.label,
      nested: subject.nested ?? false,
      skipped: false,
      offMs: off.medianMs,
      deltaMs,
      noiseMs,
      unresolved: deltaMs <= noiseMs,
    };
  });

  return { baselineMs, driftMs, rows };
}

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
export function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** Median absolute deviation — a spread that one outlying frame cannot inflate, unlike a standard deviation. */
export function medianAbsoluteDeviation(values) {
    if (values.length === 0)
        return 0;
    const m = median(values);
    return median(values.map((v) => Math.abs(v - m)));
}
export function summarise(intervals) {
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
export function sampleFrames({ frames = 24, maxMs = 3_000, warmup = 2 } = {}, raf = requestAnimationFrame, now = () => performance.now()) {
    return new Promise((resolve) => {
        const intervals = [];
        const startedAt = now();
        let last = 0;
        let seen = 0;
        const step = () => {
            const t = now();
            if (last) {
                seen++;
                if (seen > warmup)
                    intervals.push(t - last);
            }
            last = t;
            if (intervals.length >= frames || t - startedAt >= maxMs)
                resolve(summarise(intervals));
            else
                raf(step);
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
export async function runPerfSweep(subjects, sample, onProgress) {
    const live = subjects.filter((s) => s.enabled());
    const total = live.length + 2;
    let done = 0;
    const step = async (label) => {
        onProgress?.(done, total, label);
        const result = await sample();
        done += 1;
        onProgress?.(done, total, label);
        return result;
    };
    const first = await step('baseline');
    const measured = new Map();
    for (const subject of live) {
        subject.disable();
        try {
            measured.set(subject.key, await step(subject.label));
        }
        finally {
            // Always: a sweep that threw halfway and left the water switched off
            // would look like a bug in the feature rather than in the sweep.
            subject.restore();
        }
    }
    const last = await step('baseline');
    const baselineMs = (first.medianMs + last.medianMs) / 2;
    const driftMs = Math.abs(last.medianMs - first.medianMs);
    const rows = subjects.map((subject) => {
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

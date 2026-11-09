/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// What the water layer costs, mounted beneath WaterDebugPanel — the sibling of
// FogPerfPanel, and it follows that panel's rules about honesty over coverage.
//
// The headline number is the frame interval, because that is what this feature
// actually spends (docs/design/water-shader.md §4.2d: on a software rasteriser
// the settlement view goes from 141ms/frame to 247ms, and ~84ms of the ~99ms is
// rasterising and blending one full-viewport quad before the fragment shader
// computes anything). It is measured here, in the panel, with
// requestAnimationFrame rather than being reported by the renderer: it is a
// property of the whole frame and not of any one layer.
//
// The breakdown below it is that same measurement automated. Attributing GPU
// time to one effect needs a timer query this codebase has no plumbing for, and
// FogPerfPanel leaves `shaderPassMs` off for exactly that reason — but the way
// §4.2d's figures were actually obtained was by toggling flags by hand and
// watching this number, and there is no reason a person should have to do that
// twenty times. `runPerfSweep` does the toggling, and — the part doing it by eye
// skips — reports each row's noise floor so a difference smaller than the frame
// clock's own wobble is called unresolved instead of printed as a small number.
// See perfSweep.ts's header for why the rows do not add up and are not meant to.
//
// waterPerfStats is a plain object the renderer mutates directly, so — exactly
// as in FogPerfPanel — polling is the simplest correct way to observe it
// without pulling Vue reactivity into HexMapRenderer.
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { waterDebugFlags, waterPerfStats } from '../../lib/map/water/waterDebug';
import { runPerfSweep, sampleFrames } from '../../lib/map/water/perfSweep';
import { fogDebugFlags } from '../../lib/map/HexMapRenderer';
const POLL_MS = 250;
/** A second of frames, which is enough for a median to stop jumping about. */
const FRAME_WINDOW = 60;
const stats = reactive({ ...waterPerfStats });
let poll;
let raf;
const intervals = [];
let last = 0;
const sampleFrame = (now) => {
    if (last) {
        intervals.push(now - last);
        if (intervals.length > FRAME_WINDOW)
            intervals.shift();
    }
    last = now;
    raf = requestAnimationFrame(sampleFrame);
};
onMounted(() => {
    raf = requestAnimationFrame(sampleFrame);
    poll = window.setInterval(() => {
        // Median, not mean: one long frame (a re-bake, a texture upload, the tab
        // being backgrounded for a moment) would drag a mean around and say nothing
        // about what the layer normally costs.
        const sorted = [...intervals].sort((a, b) => a - b);
        waterPerfStats.frameMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
        Object.assign(stats, waterPerfStats);
    }, POLL_MS);
});
onUnmounted(() => {
    if (poll !== undefined)
        window.clearInterval(poll);
    if (raf !== undefined)
        cancelAnimationFrame(raf);
});
const ms = (v) => `${v.toFixed(2)} ms`;
const fps = computed(() => (stats.frameMs > 0 ? (1000 / stats.frameMs).toFixed(1) : '—'));
const texels = computed(() => stats.maskWidth * stats.maskHeight);
/** Thousands separators — a mask is six figures of texels and reads as noise without them. */
const count = (v) => v.toLocaleString();
// --- the breakdown ---------------------------------------------------------
const waterSubject = (key, label, nested = false) => ({
    key,
    label,
    nested,
    enabled: () => waterDebugFlags[key],
    disable: () => {
        waterDebugFlags[key] = false;
    },
    restore: () => {
        waterDebugFlags[key] = true;
    },
});
/**
 * Both fog tiers as one row. Separately they are two more samples for an answer
 * nobody wants split — the question this row answers is "how much of the frame
 * is fog rather than water", and a half-hidden fog does not answer it.
 */
const fogSubject = () => {
    let saved = [true, true];
    return {
        key: 'fog',
        label: 'Fog (both tiers)',
        enabled: () => fogDebugFlags.maskUnknown || fogDebugFlags.maskOutOfSight,
        disable: () => {
            saved = [fogDebugFlags.maskUnknown, fogDebugFlags.maskOutOfSight];
            fogDebugFlags.maskUnknown = false;
            fogDebugFlags.maskOutOfSight = false;
        },
        restore: () => {
            // Put back what was there, not `true` — one tier may already have been off
            // for something the user was looking at, and the sweep is not entitled to
            // change what is on screen once it is done.
            [fogDebugFlags.maskUnknown, fogDebugFlags.maskOutOfSight] = saved;
        },
    };
};
// Ordered coarse to fine, parents before the sub-effects they contain.
const SUBJECTS = [
    waterSubject('water', 'Water layer (all of it)'),
    waterSubject('midWaterWaves', 'Surface pattern', true),
    waterSubject('coarseCaustics', 'Coarse net', true),
    waterSubject('fineCaustics', 'Fine net', true),
    waterSubject('causticShadows', 'Shadow pools', true),
    waterSubject('shorelineFoam', 'Shoreline foam', true),
    waterSubject('legacyWaveSquiggles', 'Wave squiggles (world map)'),
    fogSubject(),
];
/**
 * ~40 frames or 4s per sample, whichever comes first — see sampleFrames.
 *
 * 4s rather than the 3s this started at: under the software rasteriser a frame
 * is ~550ms, so 3s bought five of them and the median of five wobbled by more
 * than every per-effect row was worth. It is the samples-per-row that buys
 * resolution here, and the price is only the sweep's own length.
 */
const SAMPLE = { frames: 40, maxMs: 4_000, warmup: 2 };
/** Two baselines plus one sample per subject, at up to SAMPLE.maxMs each. */
const estimateS = Math.ceil(((SUBJECTS.length + 2) * SAMPLE.maxMs) / 1000);
const running = ref(false);
const progress = ref({ done: 0, total: 0, label: '' });
const result = shallowRef(null);
async function measure() {
    if (running.value)
        return;
    running.value = true;
    result.value = null;
    try {
        result.value = await runPerfSweep(SUBJECTS, () => sampleFrames(SAMPLE), (done, total, label) => {
            progress.value = { done, total, label };
        });
    }
    finally {
        running.value = false;
    }
}
/**
 * A frame this short is almost certainly being paced by the display rather than
 * by the map — 60Hz is 16.7ms, and anything at or under that is finishing early
 * and waiting. It matters because the sweep then cannot resolve *anything*:
 * switching an effect off makes the frame finish earlier and still wait, so
 * every row comes out flat and the panel would otherwise look broken rather
 * than inapplicable. Deliberately not a claim about the refresh rate — a 120Hz
 * display sits at 8.3ms and lands here too, which is the same situation.
 */
const vsyncBound = computed(() => !!result.value && result.value.baselineMs <= 17.5);
/** Bar width: this row's cost as a share of the whole frame. */
const share = (deltaMs, baselineMs) => baselineMs > 0 ? Math.max(0, Math.min(100, Math.round((deltaMs / baselineMs) * 100))) : 0;
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(stats, {});
    __VLS_withDotValue(running, {});
    __VLS_withDotValue(progress, {});
    __VLS_withDotValue(result, {});
    __VLS_withDotValue(vsyncBound, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['drift']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['measured']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['drift']} */ ;
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['measured']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['drift']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['measured']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['drift']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "water-perf" }, title: "Water perf", storageKey: "waterPerf",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "water-perf" },
        title: "Water perf",
        storageKey: "waterPerf",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['water-perf']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_unwrap(ms, {})(stats.value.frameMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row sub" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_unwrap(fps, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row sub note" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_unwrap(ms, {})(stats.value.bakeMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row sub" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (stats.value.maskWidth);
    (stats.value.maskHeight);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row sub" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_unwrap(count, {})(__VLS_unwrap(texels, {})));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row sub" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (stats.value.bakes);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "breakdown" },
    });
    /** @type {__VLS_StyleScopedClasses['breakdown']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (measure) },
        type: "button",
        ...{ class: "measure" },
        disabled: (running.value),
    });
    /** @type {__VLS_StyleScopedClasses['measure']} */ ;
    (running.value ? `Measuring ${progress.value.done}/${progress.value.total}…` : `Measure breakdown (~${__VLS_unwrap(estimateS, {})} s)`);
    if (running.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "running" },
        });
        /** @type {__VLS_StyleScopedClasses['running']} */ ;
        (progress.value.label);
    }
    if (result.value) {
        if (vsyncBound.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "capped" },
            });
            /** @type {__VLS_StyleScopedClasses['capped']} */ ;
            ((1000 / result.value.baselineMs).toFixed(0));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row head" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "bar-track" },
        });
        /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (__VLS_unwrap(ms, {})(result.value.baselineMs));
        const __VLS_6 = __VLS_tryAsConstant((result.value.rows));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.key),
                ...{ class: "row measured" },
                ...{ class: ({ sub: row.nested }) },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            /** @type {__VLS_StyleScopedClasses['measured']} */ ;
            /** @type {__VLS_StyleScopedClasses['sub']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "label" },
            });
            /** @type {__VLS_StyleScopedClasses['label']} */ ;
            (row.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "bar-track" },
            });
            /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
            if (!row.skipped && !row.unresolved) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "bar" },
                    ...{ class: ({ nested: row.nested }) },
                    ...{ style: ({ width: __VLS_unwrap(share, {})(row.deltaMs, result.value.baselineMs) + '%' }) },
                });
                /** @type {__VLS_StyleScopedClasses['bar']} */ ;
                /** @type {__VLS_StyleScopedClasses['nested']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
                ...{ class: ({ faint: row.skipped || row.unresolved }) },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            if (row.skipped) {
            }
            else if (row.deltaMs <= 0) {
            }
            else if (row.unresolved) {
                (row.noiseMs.toFixed(1));
            }
            else {
                (row.deltaMs.toFixed(1));
            }
            // @ts-ignore
            [ms, ms, ms, stats, stats, stats, stats, stats, fps, count, texels, running, running, running, progress, progress, progress, estimateS, result, result, result, result, result, vsyncBound, share,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row drift" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "bar-track" },
        });
        /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (__VLS_unwrap(ms, {})(result.value.driftMs));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    // @ts-ignore
    [ms, result,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

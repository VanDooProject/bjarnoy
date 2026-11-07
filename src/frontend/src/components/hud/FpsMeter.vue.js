/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The actual frame rate, as its own readout at the top of the debug stack
// rather than a line inside a layer's panel.
//
// WaterPerfPanel's "Frame / ...which is" is a *median* over sixty frames,
// because `runPerfSweep` needs a baseline that one long frame can't drag
// around. That made it read a steady 59.9 fps on a map that was visibly
// stuttering: the rebuild frames it was dropping as outliers were the
// stutter. So this reports the three things a median cannot — what the last
// half-second actually averaged, how long the worst single frame in the last
// few seconds took, and how many frames in that window missed.
//
// The sparkline is the part worth reading first. A number says the map is
// slow; the strip says *how* — an even wall of tall bars is a frame that is
// simply over budget, while a flat run with one spike in it is a rebuild or a
// mask bake, which is a completely different bug.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DebugPanel from './DebugPanel.vue';
import { FRAME_WINDOW_MS, STUTTER_THRESHOLD_MS, useFrameRate } from '../../composables/useFrameRate';
const { t } = useI18n({ useScope: 'global' });
const frame = useFrameRate();
const windowS = Math.round(FRAME_WINDOW_MS / 1000);
/**
 * Bar heights for the sparkline, as a percentage of `SPARK_CEILING_MS`.
 *
 * Clamped rather than scaled to the tallest bar present: a strip that
 * renormalises every frame makes a calm 60fps stretch look identical to a
 * catastrophic one, since in both the worst bar is full height. Against a
 * fixed ceiling, calm is calm.
 */
const SPARK_CEILING_MS = 100;
/**
 * A frame long enough to read as the map freezing rather than merely dropping
 * one — a sixth of a second. This is the band a rebuild or a mask bake lands
 * in, and the reason the readout is coloured at all.
 */
const STALL_MS = 100;
const spark = computed(() => frame.recent.map((d) => ({
    height: Math.max(3, Math.min(100, (d / SPARK_CEILING_MS) * 100)),
    bad: d > STUTTER_THRESHOLD_MS,
})));
// Green while every frame is arriving on time, amber once frames are merely
// late, red once the window contains a real stall.
const health = computed(() => {
    if (frame.worstMs > STALL_MS)
        return 'bad';
    if (frame.stutters > 0 || frame.fps < 50)
        return 'warn';
    return 'ok';
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(frame, {});
    __VLS_withDotValue(spark, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['headline']} */ ;
    /** @type {__VLS_StyleScopedClasses['fps']} */ ;
    /** @type {__VLS_StyleScopedClasses['headline']} */ ;
    /** @type {__VLS_StyleScopedClasses['fps']} */ ;
    /** @type {__VLS_StyleScopedClasses['headline']} */ ;
    /** @type {__VLS_StyleScopedClasses['fps']} */ ;
    /** @type {__VLS_StyleScopedClasses['spark']} */ ;
    /** @type {__VLS_StyleScopedClasses['spark']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['bad']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['bad']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "fps-meter" }, title: (__VLS_unwrap(t, {})('hud.fpsMeter.title')), storageKey: "fpsMeter",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "fps-meter" },
        title: (__VLS_unwrap(t, {})('hud.fpsMeter.title')),
        storageKey: "fpsMeter",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['fps-meter']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "headline" },
        ...{ class: (__VLS_unwrap(health, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['headline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "fps" },
    });
    /** @type {__VLS_StyleScopedClasses['fps']} */ ;
    (frame.value.fps.toFixed(0));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "unit" },
    });
    /** @type {__VLS_StyleScopedClasses['unit']} */ ;
    (__VLS_unwrap(t, {})('hud.fpsMeter.fps'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "frame" },
    });
    /** @type {__VLS_StyleScopedClasses['frame']} */ ;
    (__VLS_unwrap(t, {})('hud.fpsMeter.msPerFrame', { n: frame.value.frameMs.toFixed(1) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spark" },
        'aria-label': (__VLS_unwrap(t, {})('hud.fpsMeter.sparkLabel', { n: spark.value.length })),
    });
    /** @type {__VLS_StyleScopedClasses['spark']} */ ;
    const __VLS_6 = __VLS_tryAsConstant((spark.value));
    for (const [bar, i] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            key: (i),
            ...{ class: "bar" },
            ...{ class: ({ bad: bar.bad }) },
            ...{ style: ({ height: bar.height + '%' }) },
        });
        /** @type {__VLS_StyleScopedClasses['bar']} */ ;
        /** @type {__VLS_StyleScopedClasses['bad']} */ ;
        // @ts-ignore
        [t, t, t, t, health, frame, frame, spark, spark,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(t, {})('hud.fpsMeter.worstFrame', { seconds: __VLS_unwrap(windowS, {}) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
        ...{ class: ({ bad: frame.value.worstMs > __VLS_unwrap(STALL_MS, {}) }) },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['bad']} */ ;
    (__VLS_unwrap(t, {})('hud.fpsMeter.ms', { n: frame.value.worstMs.toFixed(0) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ago" },
    });
    /** @type {__VLS_StyleScopedClasses['ago']} */ ;
    (__VLS_unwrap(t, {})('hud.fpsMeter.ago', { n: frame.value.worstAgoS.toFixed(1) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(t, {})('hud.fpsMeter.stutters', { threshold: __VLS_unwrap(STUTTER_THRESHOLD_MS, {}) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
        ...{ class: ({ bad: frame.value.stutters > 0 }) },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['bad']} */ ;
    (frame.value.stutters);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    (__VLS_unwrap(t, {})('hud.fpsMeter.legend', { ceiling: __VLS_unwrap(SPARK_CEILING_MS, {}) }));
    // @ts-ignore
    [t, t, t, t, t, frame, frame, frame, frame, frame, windowS, STALL_MS, STUTTER_THRESHOLD_MS, SPARK_CEILING_MS,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

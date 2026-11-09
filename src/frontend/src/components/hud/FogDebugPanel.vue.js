/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Visual on/off switches for HexMapRenderer's individual fog mechanisms
// (fogDebugFlags) — the console-only window.__fogDebug hook (main.ts) needs
// devtools and a manual pan/zoom afterward to see anything change; this
// panel does both from a click. Mounted by SettlementView.vue only when the
// URL has ?debug=1 (see its own `showFogDebug`).
import { reactive, watch } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { fogDebugFlags, fogDebugTuning } from '../../lib/map/HexMapRenderer';
const { defineEmits, } = {};
const emit = defineEmits();
// fogDebugFlags itself stays a plain object (HexMapRenderer.ts is
// deliberately Vue-reactivity-free — see its own module comment on why the
// renderer avoids Vue's proxy walk for hot-path data). Wrapping it here
// keeps that boundary: this reactive() proxy forwards every write through
// to the same underlying object HexMapRenderer reads from directly, so the
// two stay in sync without HexMapRenderer.ts importing Vue at all.
const flags = reactive(fogDebugFlags);
// Same wrapping rationale as `flags` above, for the knobs that are a value
// rather than a checkbox (FogDebugTuning).
const tuning = reactive(fogDebugTuning);
// Wide enough to bracket both "is it moving at all?" and "is this too
// fast?" around the shipped rate, which sits at 1.
const DRIFT_SPEED_MIN = 0;
const DRIFT_SPEED_MAX = 5;
const DRIFT_SPEED_STEP = 0.1;
// Labelled to match FogPerfPanel's row names ("Terrain", "Borders", "Mask
// fetch") so a toggle here and the number it moves there are easy to line
// up. See map-fog-v2.md §2.8 for why this is a different flag set from v1's.
const LABELS = {
    maskUnknown: 'Unexplored (white mist) tier enabled',
    maskOutOfSight: 'Out-of-sight (dark) tier enabled',
    warp: 'Edge noise (organic mist edge)',
    drift: 'Wind drift (animates the edge)',
    showRawMask: 'Debug: bypass edge shaping, show raw mask',
    showEffectiveMask: 'Debug: show effective mask (raw + army reveal)',
    realmBorders: 'Realm borders enabled',
    terrainCull: 'Terrain: cull past fog cutoff',
    waveCull: 'Waves: cull past fog cutoff',
    armyVisionReveal: 'Army vision reveal (client-side correction)',
};
watch([flags, tuning], () => emit('change'), { flush: 'post' });
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(flags, {});
    __VLS_withDotValue(tuning, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "fog-debug" }, title: "Fog debug", storageKey: "fog",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "fog-debug" },
        title: "Fog debug",
        storageKey: "fog",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['fog-debug']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = __VLS_tryAsConstant((__VLS_unwrap(LABELS, {})));
    for (const [label, key] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (key),
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (flags.value[key]);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (label);
        // @ts-ignore
        [LABELS, flags,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row slider-row" },
        ...{ class: ({ disabled: !flags.value.drift }) },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-value" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-value']} */ ;
    (tuning.value.driftSpeed.toFixed(1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "range",
        min: (__VLS_unwrap(DRIFT_SPEED_MIN, {})),
        max: (__VLS_unwrap(DRIFT_SPEED_MAX, {})),
        step: (__VLS_unwrap(DRIFT_SPEED_STEP, {})),
        disabled: (!flags.value.drift),
    });
    (tuning.value.driftSpeed);
    // @ts-ignore
    [flags, flags, tuning, tuning, DRIFT_SPEED_MIN, DRIFT_SPEED_MAX, DRIFT_SPEED_STEP,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};

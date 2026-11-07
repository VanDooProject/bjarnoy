/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Tuning panel for the zoom-driven world<->settlement transition — see
// docs/design/zoom-transition.md §2. Mounted by MapView.vue (the shared
// settlement/world map host) under ?debug=1, same as the fog/water panels.
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import DebugPanel from './DebugPanel.vue';
import { WORLD_HASH } from '../../lib/mapModeRoute';
import { clampTuning, zoomTransitionTuning } from '../../lib/map/zoomTransition';
const { defineProps, } = {};
const props = defineProps();
const router = useRouter();
// zoomTransitionTuning itself stays a plain object — the renderer reads it
// directly on the hot path (onWheel) and HexMapRenderer.ts is deliberately
// Vue-reactivity-free. Wrapping it here keeps that boundary, same as
// WaterDebugPanel/FogDebugPanel do for their own tuning objects.
const tuning = reactive(zoomTransitionTuning);
// Persisted in sessionStorage — tab-scoped, cleared on close, same
// throwaway-inspection-aid precedent as useFogDebug/DebugPanel's collapsed
// state. A deliberate deviation from fogDebugTuning/waterDebugTuning (which
// persist nothing and reset to the shipped value on reload): a bad value
// here causes real navigations, so losing it to an accidental reload
// mid-session is worse than for a pure visual toggle — see
// docs/design/zoom-transition.md §3.
const STORAGE_KEY = 'bjarnoy:zoomTuning';
function load() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw)
        return;
    try {
        const saved = JSON.parse(raw);
        if (typeof saved.enabled === 'boolean')
            tuning.enabled = saved.enabled;
        if (typeof saved.enterSettlementZoom === 'number')
            tuning.enterSettlementZoom = saved.enterSettlementZoom;
        if (typeof saved.exitToWorldZoom === 'number')
            tuning.exitToWorldZoom = saved.exitToWorldZoom;
        if (typeof saved.fadeMs === 'number')
            tuning.fadeMs = saved.fadeMs;
    }
    catch {
        // Corrupt/old-shape value — ignore and keep the shipped defaults.
    }
}
function save() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: tuning.enabled,
        enterSettlementZoom: tuning.enterSettlementZoom,
        exitToWorldZoom: tuning.exitToWorldZoom,
        fadeMs: tuning.fadeMs,
    }));
}
load();
function onSliderChange() {
    const fixed = clampTuning(tuning);
    tuning.enterSettlementZoom = fixed.enterSettlementZoom;
    tuning.exitToWorldZoom = fixed.exitToWorldZoom;
    save();
}
// Live zoom readout — HexMapRenderer is deliberately Vue-reactivity-free, so
// this polls cameraZoom rather than watching it, same as FogPerfPanel/
// WaterPerfPanel poll their own stats objects.
const liveZoom = ref(null);
let pollHandle;
onMounted(() => {
    pollHandle = setInterval(() => {
        liveZoom.value = props.renderer?.cameraZoom ?? null;
    }, 200);
});
onUnmounted(() => {
    if (pollHandle !== undefined)
        clearInterval(pollHandle);
});
const ENTER_RANGE = { min: 0.3, max: 1.5, step: 0.05 };
const EXIT_RANGE = { min: 0.05, max: 0.5, step: 0.02 };
const FADE_RANGE = { min: 0, max: 800, step: 20 };
const fmt = (v) => `${v.toFixed(2)}×`;
const fmtMs = (v) => `${v}ms`;
const ENABLED_LABEL = 'Zoom-driven transition enabled';
const ZOOM_LABEL = 'Current zoom';
const ENTER_LABEL = 'Zoom in → settlement at';
const EXIT_LABEL = 'Zoom out → world at';
const FADE_LABEL = 'Fade duration';
// Zoom drives settlement<->world switching for real players (see this
// component's own header comment) — RealmPanel's old manual "← World map"
// button was the only other way to force a view, and it's gone now that the
// zoom transition covers that. This is the one remaining override, kept
// debug-only on purpose: forcing a view outside the zoom threshold is a
// dev/testing shortcut, not something a real player should be able to do.
const FORCE_VIEW_LABEL = 'Force view (bypasses zoom)';
const FORCE_SETTLEMENT_LABEL = 'Settlement';
const FORCE_WORLD_LABEL = 'World';
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(tuning, {});
    __VLS_withDotValue(liveZoom, {});
    __VLS_withDotValue(ENTER_RANGE, {});
    __VLS_withDotValue(EXIT_RANGE, {});
    __VLS_withDotValue(FADE_RANGE, {});
    __VLS_withDotValue(router, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['readout']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['force-buttons']} */ ;
    /** @type {__VLS_StyleScopedClasses['force-buttons']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "zoom-debug" }, title: "Zoom transition", storageKey: "zoom",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "zoom-debug" },
        title: "Zoom transition",
        storageKey: "zoom",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['zoom-debug']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (save) },
        type: "checkbox",
    });
    (tuning.value.enabled);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(ENABLED_LABEL, {}));
    if (liveZoom.value !== null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row readout" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['readout']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(ZOOM_LABEL, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (__VLS_unwrap(fmt, {})(liveZoom.value));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row slider-row" },
        ...{ class: ({ disabled: !tuning.value.enabled }) },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    (__VLS_unwrap(ENTER_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-value" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-value']} */ ;
    (__VLS_unwrap(fmt, {})(tuning.value.enterSettlementZoom));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (onSliderChange) },
        type: "range",
        min: (ENTER_RANGE.value.min),
        max: (ENTER_RANGE.value.max),
        step: (ENTER_RANGE.value.step),
        disabled: (!tuning.value.enabled),
    });
    (tuning.value.enterSettlementZoom);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row slider-row" },
        ...{ class: ({ disabled: !tuning.value.enabled }) },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    (__VLS_unwrap(EXIT_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-value" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-value']} */ ;
    (__VLS_unwrap(fmt, {})(tuning.value.exitToWorldZoom));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (onSliderChange) },
        type: "range",
        min: (EXIT_RANGE.value.min),
        max: (EXIT_RANGE.value.max),
        step: (EXIT_RANGE.value.step),
        disabled: (!tuning.value.enabled),
    });
    (tuning.value.exitToWorldZoom);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row slider-row" },
        ...{ class: ({ disabled: !tuning.value.enabled }) },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    (__VLS_unwrap(FADE_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-value" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-value']} */ ;
    (__VLS_unwrap(fmtMs, {})(tuning.value.fadeMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (onSliderChange) },
        type: "range",
        min: (FADE_RANGE.value.min),
        max: (FADE_RANGE.value.max),
        step: (FADE_RANGE.value.step),
        disabled: (!tuning.value.enabled),
    });
    (tuning.value.fadeMs);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row force-row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['force-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(FORCE_VIEW_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "force-buttons" },
    });
    /** @type {__VLS_StyleScopedClasses['force-buttons']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (router.value.push('/settlement'));
                // @ts-ignore
                [tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, tuning, ENABLED_LABEL, liveZoom, liveZoom, ZOOM_LABEL, fmt, fmt, fmt, ENTER_LABEL, ENTER_RANGE, ENTER_RANGE, ENTER_RANGE, EXIT_LABEL, EXIT_RANGE, EXIT_RANGE, EXIT_RANGE, FADE_LABEL, fmtMs, FADE_RANGE, FADE_RANGE, FADE_RANGE, FORCE_VIEW_LABEL, router,];
            } },
        type: "button",
    });
    (__VLS_unwrap(FORCE_SETTLEMENT_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (router.value.push({ path: '/settlement', hash: __VLS_unwrap(WORLD_HASH, {}) }));
                // @ts-ignore
                [router, FORCE_SETTLEMENT_LABEL, WORLD_HASH,];
            } },
        type: "button",
    });
    (__VLS_unwrap(FORCE_WORLD_LABEL, {}));
    // @ts-ignore
    [FORCE_WORLD_LABEL,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

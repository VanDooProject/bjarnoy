/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import MapLoadingIndicator from './MapLoadingIndicator.vue';
import MapStatusOverlay from './MapStatusOverlay.vue';
const { defineProps, defineEmits, defineExpose, } = {};
const props = defineProps();
const emit = defineEmits();
const container = ref(null);
const canvas = ref(null);
const { renderer, loadState, animLoad, mountError, retry: retryMount } = useHexMapRenderer(canvas, container, {
    mode: props.mode ?? 'settlement',
    worldModel: props.worldModel,
    playerId: props.playerId,
    settlementId: props.settlementId,
    previewCenter: props.previewCenter,
    previewRadius: props.previewRadius,
    previewRenderRadius: props.previewRenderRadius,
    highlightCoord: props.highlightCoord,
    highlightCoords: props.highlightCoords,
    screenBiasX: props.screenBiasX,
    hideSettlementBadge: props.hideSettlementBadge,
    lockCamera: props.lockCamera,
    previewSea: props.previewSea,
    confineCamera: props.confineCamera,
    onHexClick: (coord, tile, screen) => emit('hex-click', coord, tile, screen),
    onHoverChange: (info) => emit('hover', info),
    onWaypointMove: (index, coord) => emit('waypoint-move', index, coord),
    onWaypointTap: (index) => emit('waypoint-tap', index),
    onZoomModeChange: (mode) => emit('zoom-mode-change', mode),
    onCameraChange: () => emit('camera-change'),
});
// FogDebugPanel (SettlementView.vue, ?debug=1) needs to force a rebuild
// after flipping a fogDebugFlags toggle — nothing else would make the
// change visible until the next real camera pan/zoom.
// `mountError`/`retryMount` let a parent view see (and re-trigger) a failed
// renderer mount, e.g. to gate its own e2e-visible ready state.
const __VLS_exposed = { renderer, loadState, animLoad, mountError, retryMount };
defineExpose(__VLS_exposed);
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
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-container" },
        ...{ style: (__VLS_ctx.background ? { background: __VLS_ctx.background } : undefined) },
    });
    /** @type {__VLS_StyleScopedClasses['map-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
    });
    const __VLS_0 = MapLoadingIndicator;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        state: (__VLS_unwrap(loadState, {})),
    }));
    const __VLS_2 = __VLS_1({
        state: (__VLS_unwrap(loadState, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const __VLS_5 = MapStatusOverlay;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        ...{ 'onRetry': {} }, step: (null), error: (__VLS_unwrap(mountError, {})),
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onRetry': {} },
        step: (null),
        error: (__VLS_unwrap(mountError, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_10;
    const __VLS_11 = {
        /** @type {typeof __VLS_10.retry} */
        onRetry: (__VLS_unwrap(retryMount, {})),
    };
    void __VLS_11;
    var __VLS_8;
    var __VLS_9;
    // @ts-ignore
    [background, background, loadState, mountError, retryMount,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
    __typeProps: {},
});
export default {};

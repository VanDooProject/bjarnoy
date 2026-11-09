/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
const { defineProps, defineEmits, defineExpose, } = {};
const props = defineProps();
const emit = defineEmits();
const container = ref(null);
const canvas = ref(null);
const { renderer } = useHexMapRenderer(canvas, container, {
    mode: 'world',
    worldModel: props.worldModel,
    playerId: props.playerId,
    previewCenter: props.previewCenter,
    previewRadius: props.previewRadius,
    confineCamera: props.confineCamera,
    allowPageScroll: props.allowPageScroll,
    onHexClick: (coord, tile, screen) => emit('hex-click', coord, tile, screen),
});
// FogDebugPanel (WorldMapView.vue, ?debug=1) needs to force a rebuild after
// flipping a fogDebugFlags toggle — nothing else would make the change
// visible until the next real camera pan/zoom. Same wiring as
// SettlementCanvas.vue's own expose.
const __VLS_exposed = { renderer };
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
    });
    /** @type {__VLS_StyleScopedClasses['map-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: ({ 'page-scroll': __VLS_ctx.allowPageScroll }) },
    });
    /** @type {__VLS_StyleScopedClasses['page-scroll']} */ ;
    // @ts-ignore
    [allowPageScroll,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
    __typeProps: {},
});
export default {};

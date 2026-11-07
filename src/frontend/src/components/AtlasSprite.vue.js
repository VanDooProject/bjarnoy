/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Renders one frame out of a WebP atlas page as a plain HTML element,
// without decoding it through Pixi first — used by the non-canvas UI
// (docs pages, tooltips, build overlays) that wants the same higher-res
// showcase art the map renderer's atlas.ts already loads, but as a normal
// DOM image rather than a GPU texture.
//
// The frame renders at its own aspect ratio (no cropping): give the parent
// a fixed size and this fits inside it, same as `object-fit: contain`.
import { computed } from 'vue';
import { atlasBackgroundStyle } from '../lib/map/atlas';
const { defineProps, } = {};
const props = defineProps();
const style = computed(() => atlasBackgroundStyle(props.frame));
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
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "atlas-sprite" },
        role: "img",
        ...{ style: (__VLS_unwrap(style, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['atlas-sprite']} */ ;
    // @ts-ignore
    [style,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

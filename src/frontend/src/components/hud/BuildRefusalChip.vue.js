/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// W3: a build that was shown optimistically (the "…" dial on its hex) and then
// refused by the server. This small chip carries the server's message under
// the hex for a moment; the dial itself shakes and fades (HexMapRenderer's
// `rejectConstructionDial`). Pinned to the hex with useMapAnchor, the way
// GuidancePointer is, so it follows the camera while it is up.
import { ref } from 'vue';
import { useMapAnchor } from '../../composables/useMapAnchor';
const { defineProps, } = {};
const props = defineProps();
const el = ref(null);
useMapAnchor(el, () => props.renderer, () => props.coord);
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
    /** @type {__VLS_StyleScopedClasses['refusal-chip-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "el",
        ...{ class: "refusal-chip" },
        role: "status",
        'data-testid': "build-refusal",
    });
    /** @type {__VLS_StyleScopedClasses['refusal-chip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "refusal-chip-body" },
    });
    /** @type {__VLS_StyleScopedClasses['refusal-chip-body']} */ ;
    (__VLS_ctx.message);
    // @ts-ignore
    [message,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

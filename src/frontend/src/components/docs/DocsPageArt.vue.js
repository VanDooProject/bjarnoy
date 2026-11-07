/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import AtlasSprite from '../AtlasSprite.vue';
import { findAtlasFrame } from '../../lib/map/atlas';
import { docsStillFrameName } from '../../lib/docs/docsPages';
const { defineProps, } = {};
const props = defineProps();
const frame = computed(() => findAtlasFrame('showcase', docsStillFrameName(props.art)));
// AtlasSprite keeps the frame's aspect ratio, so a width of min(100%, box height x ratio) contain-fits it.
const fit = computed(() => (frame.value ? { width: `min(100%, ${(props.size * frame.value.frame.w) / frame.value.frame.h}px)` } : {}));
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
    __VLS_withDotValue(frame, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "docs-page-art" },
        'data-testid': "docs-page-art",
        'data-art': (__VLS_ctx.art),
        ...{ style: ({ width: `${__VLS_ctx.size}px`, height: `${__VLS_ctx.size}px` }) },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['docs-page-art']} */ ;
    if (frame.value) {
        const __VLS_0 = AtlasSprite;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            frame: (frame.value), ...{ style: (__VLS_unwrap(fit, {})) },
        }));
        const __VLS_2 = __VLS_1({
            frame: (frame.value),
            ...{ style: (__VLS_unwrap(fit, {})) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    // @ts-ignore
    [art, size, size, frame, frame, fit,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

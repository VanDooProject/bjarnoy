/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import DocsPageArt from './DocsPageArt.vue';
const { defineProps, } = {};
const __VLS_props = defineProps();
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
    /** @type {__VLS_StyleScopedClasses['header-art']} */ ;
    /** @type {__VLS_StyleScopedClasses['header-art']} */ ;
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['header-art']} */ ;
    /** @type {__VLS_StyleScopedClasses['backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "header-art" },
        'data-mode': (__VLS_ctx.page.headerArt),
        'data-testid': "docs-header-art",
    });
    /** @type {__VLS_StyleScopedClasses['header-art']} */ ;
    const __VLS_0 = DocsPageArt;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "icon" }, art: (__VLS_ctx.page.art), size: (72), dataTestid: "docs-header-icon",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "icon" },
        art: (__VLS_ctx.page.art),
        size: (72),
        dataTestid: "docs-header-icon",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    if (__VLS_ctx.page.headerArt === 'backdrop') {
        const __VLS_5 = DocsPageArt;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            // @ts-ignore
            ...{ class: "backdrop" }, art: (__VLS_ctx.page.art), size: (260), dataTestid: "docs-header-backdrop",
        }));
        const __VLS_7 = __VLS_6({
            ...{ class: "backdrop" },
            art: (__VLS_ctx.page.art),
            size: (260),
            dataTestid: "docs-header-backdrop",
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        /** @type {__VLS_StyleScopedClasses['backdrop']} */ ;
    }
    // @ts-ignore
    [page, page, page, page,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

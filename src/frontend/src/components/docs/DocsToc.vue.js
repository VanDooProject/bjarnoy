/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
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
    /** @type {__VLS_StyleScopedClasses['toc-link']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "toc" },
        'aria-label': (__VLS_ctx.$t('docs.status.toc')),
    });
    /** @type {__VLS_StyleScopedClasses['toc']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.links));
    for (const [link] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
            key: (link.href),
            ...{ class: "toc-link" },
            href: (link.href),
        });
        /** @type {__VLS_StyleScopedClasses['toc-link']} */ ;
        (link.label);
        // @ts-ignore
        [$t, links,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

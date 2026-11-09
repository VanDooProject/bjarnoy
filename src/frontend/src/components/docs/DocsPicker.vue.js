/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const { defineProps, defineEmits, } = {};
const __VLS_export = ((__VLS_props, __VLS_ctx, __VLS_exposed, __VLS_setup = (async () => {
    const __VLS_props = defineProps();
    const __VLS_emit = defineEmits();
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
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "variants" },
        });
        /** @type {__VLS_StyleScopedClasses['variants']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "variants-label" },
        });
        /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
        (__VLS_ctx.label);
        const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.options));
        for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        return (__VLS_ctx.$emit('update:modelValue', option.value));
                        // @ts-ignore
                        [label, options, $emit,];
                    } },
                key: (option.value),
                type: "button",
                ...{ class: "variant-button" },
                ...{ class: ({ active: __VLS_ctx.modelValue === option.value }) },
            });
            /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (option.label);
            // @ts-ignore
            [modelValue,];
        }
        // @ts-ignore
        [];
        return {};
    };
    void [__VLS_template];
    return {};
})()) => ({}));
export default {};

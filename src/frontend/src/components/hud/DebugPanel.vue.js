/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The collapsible shell every `?debug=1` panel sits in.
//
// The stack outgrew the viewport: four panels, and the water one alone carries
// eleven checkboxes and ten sliders. The column scrolls (see the views' own
// `.fog-debug-stack` rule), but scrolling past three panels to reach the fourth
// is not the same as being able to put the three away — and while you are
// tuning the water you are not reading the fog's flags.
//
// Collapsed state is per panel and kept in sessionStorage, the same scope and
// for the same reason as the debug flag that reveals these panels at all
// (useFogDebug): scoped to this tab, cleared on close, because this is a
// throwaway inspection aid and not a setting worth remembering across visits.
// It has to outlive a navigation, though — every internal nav remounts these
// components, and a panel that springs back open each time you change view is
// worse than one that never collapsed.
import { ref, watch } from 'vue';
const { defineProps, } = {};
const props = defineProps();
const key = `bjarnoy:debugPanel:${props.storageKey}`;
const collapsed = ref(sessionStorage.getItem(key) === '1');
watch(collapsed, (value) => {
    if (value)
        sessionStorage.setItem(key, '1');
    else
        sessionStorage.removeItem(key);
});
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
    __VLS_withDotValue(collapsed, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['chevron']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel debug-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['debug-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (collapsed.value = !collapsed.value);
                // @ts-ignore
                [collapsed, collapsed,];
            } },
        type: "button",
        ...{ class: "title" },
        'aria-expanded': (!collapsed.value),
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "chevron" },
        ...{ class: ({ collapsed: collapsed.value }) },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['chevron']} */ ;
    /** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    const __VLS_0 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
    __VLS_0(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (!collapsed.value), }, ...__VLS_directiveHookArgsRest(__VLS_0));
    var __VLS_1 = {};
    var __VLS_2 = __VLS_1;
    // @ts-ignore
    [collapsed, collapsed, collapsed, title,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __typeProps: {},
});
const __VLS_export = {};
export default {};

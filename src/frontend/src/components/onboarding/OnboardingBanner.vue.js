/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The two celebratory pill banners from the design handoff "2a": the
// landfall moment (frame 2) and onboarding's completion (frame 5). Frame 5
// itself has no explicit "go on in" button — but removing the forced
// nickname modal (task 9) removes the only route `/settlement` had, and the
// player needs a reliable, e2e-stable way to actually get there, so
// `complete` adds one.
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';
const { defineProps, defineEmits, } = {};
const __VLS_props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: 'global' });
const isTouch = useMediaQuery(TOUCH_QUERY);
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
    __VLS_withDotValue(isTouch, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['landfall']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['complete']} */ ;
    /** @type {__VLS_StyleScopedClasses['continue']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['landfall']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['landfall']} */ ;
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['landfall']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "banner" },
        ...{ class: (__VLS_ctx.variant) },
        'data-testid': "onboarding-banner",
    });
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "check" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_ctx.variant === 'landfall' ? __VLS_unwrap(t, {})('landing.banner.landfallTitle') : __VLS_unwrap(t, {})('landing.banner.completeTitle'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    (__VLS_ctx.variant === 'landfall' ? __VLS_unwrap(t, {})('landing.banner.landfallBody') : isTouch.value ? __VLS_unwrap(t, {})('landing.banner.completeBodyTouch') : __VLS_unwrap(t, {})('landing.banner.completeBody'));
    if (__VLS_ctx.variant === 'complete') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(__VLS_ctx.variant === 'complete'))
                        throw 0;
                    return (__VLS_unwrap(emit, {})('continue'));
                    // @ts-ignore
                    [variant, variant, variant, variant, t, t, t, t, t, isTouch, emit,];
                } },
            type: "button",
            ...{ class: "continue" },
            'data-testid': "onboarding-continue",
        });
        /** @type {__VLS_StyleScopedClasses['continue']} */ ;
        (__VLS_unwrap(t, {})('landing.banner.continueCta'));
    }
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

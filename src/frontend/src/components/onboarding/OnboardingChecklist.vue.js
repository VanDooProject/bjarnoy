/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The landing page's guided-onboarding tray, rebuilt as a live checklist
// (design handoff "Landing Onboarding Flow 2a"): a header with a step
// count, a progress bar, and three rows that read "done" the instant their
// building is actually standing (see onboardingGuidance.ts) rather than a
// fixed step counter. Previously this markup lived inline in
// LandingView.vue; pulled out so the derivation (onboardingGuidance.ts) and
// the render can each be tested on their own.
import { useI18n } from 'vue-i18n';
import { buildingName } from '../../i18n/catalogueNames';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: 'global' });
const isTouch = useMediaQuery(TOUCH_QUERY);
function nameFor(key) {
    return key === 'longhouse' ? t('landing.tray.longhouseName') : buildingName(key);
}
function subtextFor(row) {
    if (row.state === 'done')
        return t('landing.tray.placed');
    if (row.key === 'longhouse')
        return isTouch.value ? t('landing.tray.tapToPlace') : t('landing.tray.clickToPlace');
    if (!props.hasFounded)
        return t('landing.tray.foundFirst');
    return isTouch.value ? t('landing.tray.tapEmptyHex') : t('landing.tray.clickEmptyHex');
}
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
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-title']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-progress']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tray panel" },
        'data-testid': "onboarding-checklist",
    });
    /** @type {__VLS_StyleScopedClasses['tray']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tray-header" },
    });
    /** @type {__VLS_StyleScopedClasses['tray-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tray-title" },
    });
    /** @type {__VLS_StyleScopedClasses['tray-title']} */ ;
    (__VLS_unwrap(t, {})('landing.tray.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tray-step" },
    });
    /** @type {__VLS_StyleScopedClasses['tray-step']} */ ;
    (__VLS_unwrap(t, {})('landing.tray.stepOf', { step: __VLS_ctx.guidance.step, total: __VLS_ctx.guidance.totalSteps }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tray-progress" },
    });
    /** @type {__VLS_StyleScopedClasses['tray-progress']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "tray-progress-fill" },
        ...{ style: ({ width: `${Math.round(__VLS_ctx.guidance.progress * 100)}%` }) },
    });
    /** @type {__VLS_StyleScopedClasses['tray-progress-fill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tray-rows" },
    });
    /** @type {__VLS_StyleScopedClasses['tray-rows']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.guidance.rows));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        const __VLS_1 = (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : 'div');
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            ...{ 'onClick': {} }, key: (row.key), ...{ class: "tray-item" }, ...{ class: (row.state) }, type: (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : undefined), dataTestid: (row.state === 'current' && __VLS_ctx.canFocus ? 'onboarding-focus' : undefined),
        }));
        const __VLS_3 = __VLS_2({
            ...{ 'onClick': {} },
            key: (row.key),
            ...{ class: "tray-item" },
            ...{ class: (row.state) },
            type: (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : undefined),
            dataTestid: (row.state === 'current' && __VLS_ctx.canFocus ? 'onboarding-focus' : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        let __VLS_6;
        const __VLS_7 = {
            /** @type {typeof __VLS_6.click} */
            onClick: (...[$event]) => {
                void $event;
                return (row.state === 'current' && __VLS_ctx.canFocus && __VLS_unwrap(emit, {})('focus'));
                // @ts-ignore
                [t, t, guidance, guidance, guidance, guidance, canFocus, canFocus, canFocus, canFocus, emit,];
            },
        };
        void __VLS_7;
        /** @type {__VLS_StyleScopedClasses['tray-item']} */ ;
        var __VLS_4;
        var __VLS_5;
        const { default: __VLS_8 } = __VLS_nonNull(__VLS_4.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "dot" },
        });
        /** @type {__VLS_StyleScopedClasses['dot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (nameFor(row.key));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "sub" },
        });
        /** @type {__VLS_StyleScopedClasses['sub']} */ ;
        (subtextFor(row));
        // @ts-ignore
        [];
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

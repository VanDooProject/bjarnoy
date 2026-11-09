/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// One-time landing prompt (rendered into ReturningPlayerMenu's `#nudge` slot,
// same speech-bubble look as ProfileNudge.vue minus the bobbing): shown when
// the device asks for reduced motion, so the player knows why menus and the
// map are held still and can turn the animations on. Visibility rules live in
// lib/perf/motionPreferences.ts (`promptVisible`), the answer is persisted
// there too so it never comes back. Non-modal: no backdrop, and like
// ProfileNudge it takes no pointer events itself so it cannot eat map clicks
// (only its buttons do).
import { useI18n } from 'vue-i18n';
import { motionPreferences } from '../../lib/perf/motionPreferences';
const { t } = useI18n({ useScope: 'global' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(motionPreferences, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['close']} */ ;
    /** @type {__VLS_StyleScopedClasses['later']} */ ;
    if (motionPreferences.value.promptVisible) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "motion-prompt panel" },
            role: "region",
            'aria-label': (__VLS_unwrap(t, {})('onboarding.motionPrompt.title')),
            'data-testid': "motion-prompt",
        });
        /** @type {__VLS_StyleScopedClasses['motion-prompt']} */ ;
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "notch" },
        });
        /** @type {__VLS_StyleScopedClasses['notch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "head" },
        });
        /** @type {__VLS_StyleScopedClasses['head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.eyebrow'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(motionPreferences, {});
                    if (!(motionPreferences.value.promptVisible))
                        throw 0;
                    return (motionPreferences.value.dismissPrompt());
                    // @ts-ignore
                    [motionPreferences, motionPreferences, t, t,];
                } },
            type: "button",
            ...{ class: "close" },
            'aria-label': (__VLS_unwrap(t, {})('onboarding.motionPrompt.close')),
            'data-testid': "motion-prompt-close",
        });
        /** @type {__VLS_StyleScopedClasses['close']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 12 12",
            width: "12",
            height: "12",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M2 2l8 8M10 2l-8 8",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "title" },
        });
        /** @type {__VLS_StyleScopedClasses['title']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "body" },
        });
        /** @type {__VLS_StyleScopedClasses['body']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.body'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "actions" },
        });
        /** @type {__VLS_StyleScopedClasses['actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(motionPreferences, {});
                    if (!(motionPreferences.value.promptVisible))
                        throw 0;
                    return (motionPreferences.value.turnAllOn());
                    // @ts-ignore
                    [motionPreferences, t, t, t,];
                } },
            type: "button",
            ...{ class: "cta" },
            'data-testid': "motion-prompt-on",
        });
        /** @type {__VLS_StyleScopedClasses['cta']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.turnOn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(motionPreferences, {});
                    if (!(motionPreferences.value.promptVisible))
                        throw 0;
                    return (motionPreferences.value.dismissPrompt());
                    // @ts-ignore
                    [motionPreferences, t,];
                } },
            type: "button",
            ...{ class: "later" },
            'data-testid': "motion-prompt-dismiss",
        });
        /** @type {__VLS_StyleScopedClasses['later']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.keep'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "footer" },
        });
        /** @type {__VLS_StyleScopedClasses['footer']} */ ;
        (__VLS_unwrap(t, {})('onboarding.motionPrompt.footer'));
    }
    // @ts-ignore
    [t, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

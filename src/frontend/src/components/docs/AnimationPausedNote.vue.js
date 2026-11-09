/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Shown on a docs page whose art animates (the wildlife camps, the wasted lands' giants) while the
// docs' animation clock is held still (useAnimationClock.ts): the device asks for reduced motion
// or saves data on the 'auto' setting, or animations are switched off. The setting is per device
// and lives on the profile page, which needs an account - so without this a visitor who has none
// only ever sees still frames, with no way to start them. "Play animations" sets the same
// per-device setting the profile page does, and the clocks pick it up at once.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { animationPreference } from '../../lib/perf/animationPreference';
const { t } = useI18n({ useScope: 'global' });
/** Why the docs' clock is held, or null when it runs - the same rule as `useAnimationClock`'s `clockShouldRun`. */
const reason = computed(() => {
    const setting = animationPreference.setting;
    if (setting === 'on')
        return null;
    if (setting === 'off')
        return 'off';
    if (animationPreference.reducedMotion)
        return 'reducedMotion';
    if (animationPreference.saveData)
        return 'saveData';
    return null;
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(reason, {});
    __VLS_withDotValue(animationPreference, {});
    void {};
    if (reason.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "animation-paused" },
            role: "status",
            'data-testid': "animation-paused",
        });
        /** @type {__VLS_StyleScopedClasses['animation-paused']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(t, {})(`docs.animations.paused.${reason.value}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(animationPreference, {});
                    if (!(reason.value))
                        throw 0;
                    return (animationPreference.value.setting = 'on');
                    // @ts-ignore
                    [reason, reason, t, animationPreference,];
                } },
            type: "button",
            ...{ class: "play" },
        });
        /** @type {__VLS_StyleScopedClasses['play']} */ ;
        (__VLS_unwrap(t, {})('docs.animations.play'));
    }
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

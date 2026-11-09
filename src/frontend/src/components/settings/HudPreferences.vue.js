/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The mobile-only HUD bar's top/bottom docking preference (stores/hudPrefs.ts)
// — a debug/UX-research flag, not an everyday setting, so it lives in the
// Settings modal (SettingsModal.vue) rather than a HUD-adjacent quick menu. Segmented
// control styled after LocaleSwitcher.vue's .option/.option.active pattern
// (that component itself is untouched — out of scope for this feature).
import { useI18n } from 'vue-i18n';
import { useHudPrefsStore } from '../../stores/hudPrefs';
const hudPrefs = useHudPrefsStore();
const { t } = useI18n({ useScope: 'global' });
const POSITIONS = ['top', 'bottom'];
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(hudPrefs, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "hud-preferences" },
    });
    /** @type {__VLS_StyleScopedClasses['hud-preferences']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('profile.hudBar.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_unwrap(t, {})('profile.hudBar.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        id: "hud-bar-position-label",
        ...{ class: "field-label" },
    });
    /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
    (__VLS_unwrap(t, {})('profile.hudBar.position'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "position-toggle" },
        role: "group",
        'aria-labelledby': "hud-bar-position-label",
    });
    /** @type {__VLS_StyleScopedClasses['position-toggle']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(POSITIONS, {})));
    for (const [position] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (hudPrefs.value.setBarPosition(position));
                    // @ts-ignore
                    [t, t, t, POSITIONS, hudPrefs,];
                } },
            key: (position),
            type: "button",
            ...{ class: "option" },
            ...{ class: ({ active: hudPrefs.value.barPosition === position }) },
            'aria-pressed': (hudPrefs.value.barPosition === position),
        });
        /** @type {__VLS_StyleScopedClasses['option']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`profile.hudBar.${position}`));
        // @ts-ignore
        [t, hudPrefs, hudPrefs,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

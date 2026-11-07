/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The language switcher as a row of the HUD's dropdown menus (HudNav's
// account menu and ReturningPlayerMenu), instead of a control of its own in
// the bar. Hidden at phone width like every bar mount of LocaleSwitcher: the
// phone's only switcher lives in the HUD drawer (MobileHudDrawer.vue).
import { useI18n } from 'vue-i18n';
import LocaleSwitcher from '../LocaleSwitcher.vue';
const { t } = useI18n({ useScope: 'global' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['locale-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['locale-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "locale-row" },
        'data-testid': "menu-locale-row",
    });
    /** @type {__VLS_StyleScopedClasses['locale-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "locale-label" },
    });
    /** @type {__VLS_StyleScopedClasses['locale-label']} */ ;
    (__VLS_unwrap(t, {})('common.localeSwitcher.label'));
    const __VLS_0 = LocaleSwitcher;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A small always-visible EN/DE toggle rather than a <select>: only two
// locales exist right now (see i18n/locale.ts's SUPPORTED_LOCALES), and a
// toggle shows both options and the active one at a glance without opening
// anything. Reused across the HUD nav and every standalone page's topbar.
//
// On a phone it never sits in a bar: there's no room for it next to the
// game's own controls, and the initial locale already follows the browser
// (i18n/locale.ts's detectInitialLocale). The only place it shows at phone
// width is inside the HUD's pull-down drawer (MobileHudDrawer.vue passes
// `inDrawer`); every other mount hides itself below the breakpoint.
import { useI18n } from 'vue-i18n';
import { setLocale, SUPPORTED_LOCALES } from '../i18n';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
const { defineProps, } = {};
const __VLS_props = defineProps();
const { t, locale } = useI18n({ useScope: 'global' });
const authStore = useAuthStore();
function label(code) {
    return t(`common.localeSwitcher.${code}`);
}
function selectLocale(code) {
    setLocale(code);
    if (authStore.isAuthenticated) {
        // Best-effort: the switch already applied locally either way.
        api.updateMyLocale({ preferredLocale: code }).catch(() => { });
    }
}
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
    __VLS_withDotValue(locale, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['locale-switcher']} */ ;
    /** @type {__VLS_StyleScopedClasses['locale-switcher']} */ ;
    /** @type {__VLS_StyleScopedClasses['in-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['locale-switcher']} */ ;
    /** @type {__VLS_StyleScopedClasses['in-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "locale-switcher" },
        ...{ class: ({ 'in-drawer': __VLS_ctx.inDrawer }) },
        role: "group",
        'aria-label': (__VLS_unwrap(t, {})('common.localeSwitcher.label')),
    });
    /** @type {__VLS_StyleScopedClasses['locale-switcher']} */ ;
    /** @type {__VLS_StyleScopedClasses['in-drawer']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(SUPPORTED_LOCALES, {})));
    for (const [code] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (selectLocale(code));
                    // @ts-ignore
                    [inDrawer, t, SUPPORTED_LOCALES,];
                } },
            key: (code),
            type: "button",
            ...{ class: "option" },
            ...{ class: ({ active: locale.value === code }) },
            'aria-pressed': (locale.value === code),
            title: (label(code)),
        });
        /** @type {__VLS_StyleScopedClasses['option']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (code.toUpperCase());
        // @ts-ignore
        [locale, locale,];
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

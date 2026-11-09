/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The per-device settings as a modal over whatever page was showing before —
// see lib/modalRoute.ts and App.vue's own comment on the background-route
// pattern. No account needed: the settings are stored on this device.
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import DeviceSettings from './DeviceSettings.vue';
import { useIsMobile } from '../../composables/useIsMobile';
const { t } = useI18n({ useScope: 'global' });
// On a phone RouteModal's header bar already carries the title.
const isMobile = useIsMobile();
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(isMobile, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['settings']} */ ;
    const __VLS_0 = RouteModal || RouteModal;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        title: (__VLS_unwrap(t, {})('hud.accountMenu.settings')), testid: "settings-modal",
    }));
    const __VLS_2 = __VLS_1({
        title: (__VLS_unwrap(t, {})('hud.accountMenu.settings')),
        testid: "settings-modal",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings" },
    });
    /** @type {__VLS_StyleScopedClasses['settings']} */ ;
    if (!isMobile.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
        (__VLS_unwrap(t, {})('hud.accountMenu.settings'));
    }
    const __VLS_6 = DeviceSettings;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    // @ts-ignore
    [t, t, isMobile,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The per-device settings (HUD, ring size, graphics) as one block. They live
// on this device, not on an account, so SettingsModal.vue shows them to
// anonymous players too.
import HudPreferences from './HudPreferences.vue';
import RingSizePreferences from './RingSizePreferences.vue';
import AnimationPreferences from './AnimationPreferences.vue';
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-tab" },
        'data-testid': "device-settings",
    });
    /** @type {__VLS_StyleScopedClasses['settings-tab']} */ ;
    const __VLS_0 = HudPreferences;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const __VLS_5 = RingSizePreferences;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    }));
    const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
    const __VLS_10 = AnimationPreferences;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
    // @ts-ignore
    }));
    const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

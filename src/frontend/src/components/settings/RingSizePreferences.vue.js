/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Size of the radial (ring) menu, per device (lib/map/ringSize.ts). Same segmented control as HudPreferences.vue.
import { useI18n } from 'vue-i18n';
import { RING_SIZE_SETTINGS, ringSizePreference } from '../../lib/map/ringSize';
const { t } = useI18n({ useScope: 'global' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(ringSizePreference, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ring-size-preferences" },
    });
    /** @type {__VLS_StyleScopedClasses['ring-size-preferences']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('profile.ringMenu.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_unwrap(t, {})('profile.ringMenu.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        id: "ring-size-label",
        ...{ class: "field-label" },
    });
    /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
    (__VLS_unwrap(t, {})('profile.ringMenu.size'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "size-toggle" },
        role: "group",
        'aria-labelledby': "ring-size-label",
        'data-testid': "ring-size",
    });
    /** @type {__VLS_StyleScopedClasses['size-toggle']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(RING_SIZE_SETTINGS, {})));
    for (const [size] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(ringSizePreference, {});
                    return (ringSizePreference.value.setting = size);
                    // @ts-ignore
                    [t, t, t, RING_SIZE_SETTINGS, ringSizePreference,];
                } },
            key: (size),
            type: "button",
            ...{ class: "option" },
            ...{ class: ({ active: ringSizePreference.value.setting === size }) },
            'aria-pressed': (ringSizePreference.value.setting === size),
        });
        /** @type {__VLS_StyleScopedClasses['option']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`profile.ringMenu.${size}`));
        // @ts-ignore
        [t, ringSizePreference, ringSizePreference,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { introText } from './introText';
const { defineProps, withDefaults, } = {};
const __VLS_props = withDefaults(defineProps(), { testid: 'landing-impressum' });
const __VLS_defaults = { testid: 'landing-impressum' };
void __VLS_defaults;
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
    void {};
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ class: "legal" },
        href: "/impressum",
        'data-testid': (__VLS_ctx.testid),
    });
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'landing.impressum'));
    // @ts-ignore
    [testid, introText, locale,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};

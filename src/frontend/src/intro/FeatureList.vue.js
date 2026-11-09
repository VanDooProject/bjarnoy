/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { introText } from './introText';
const { defineProps, withDefaults, } = {};
const __VLS_props = withDefaults(defineProps(), { idPrefix: 'landing' });
const FEATURES = [
    { id: 'multiplayer', key: 'multiplayer' },
    { id: 'noPayToWin', key: 'noPayToWin' },
    { id: 'adFree', key: 'adFree' },
];
const __VLS_defaults = { idPrefix: 'landing' };
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
    /** @type {__VLS_StyleScopedClasses['usp']} */ ;
    /** @type {__VLS_StyleScopedClasses['usp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "feature-list" },
    });
    /** @type {__VLS_StyleScopedClasses['feature-list']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(FEATURES, {})));
    for (const [f] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (f.id),
            ...{ class: "usp" },
            'data-testid': (`${__VLS_ctx.idPrefix}-usp-${f.id}`),
        });
        /** @type {__VLS_StyleScopedClasses['usp']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "ico" },
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.4",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['ico']} */ ;
        if (f.id === 'multiplayer') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "8",
                cy: "9",
                r: "3",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "16",
                cy: "9",
                r: "3",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 4-5 3 0 6 2 6 5",
            });
        }
        else if (f.id === 'noPayToWin') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M12 3v17M7 20h10M4 7h16",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M6.5 7L3.5 13a3 3 0 0 0 6 0zM17.5 7l-3 6a3 3 0 0 0 6 0z",
            });
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.3c0 6-8 10.6-8 10.6z",
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
        (__VLS_unwrap(introText, {})(__VLS_ctx.locale, `landing.features.${f.key}.title`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(introText, {})(__VLS_ctx.locale, `landing.features.${f.key}.text`));
        // @ts-ignore
        [FEATURES, idPrefix, introText, introText, locale, locale,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};

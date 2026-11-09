/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, useId } from 'vue';
import { RESOURCE_GLYPHS, RESOURCE_TOKENS } from '../lib/resources/resourceGlyphs';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), { size: 16 });
// The iron glyph carries an svg <mask>; ids are document-global, so each
// instance gets its own.
const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
const markup = computed(() => RESOURCE_GLYPHS[props.kind].replaceAll('{mask}', `res-mask-${uid}`));
const fill = computed(() => RESOURCE_TOKENS[props.kind]);
const __VLS_defaults = { size: 16 };
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg)({
        ...{ class: "resource-icon" },
        viewBox: "0 0 24 24",
        width: (__VLS_ctx.size),
        height: (__VLS_ctx.size),
        fill: (__VLS_unwrap(fill, {})),
        'aria-hidden': "true",
        focusable: "false",
    });
    const __VLS_0 = __VLS_asFunctionalDirective(__VLS_directives.vHtml, {});
    __VLS_0(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (__VLS_unwrap(markup, {})), }, ...__VLS_directiveHookArgsRest(__VLS_0));
    /** @type {__VLS_StyleScopedClasses['resource-icon']} */ ;
    // @ts-ignore
    [size, size, fill, markup,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};

/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
const { defineProps, withDefaults, defineOptions, } = {};
// Technical or admin-only docs content: rendered only for an admin who has
// switched "Show admin notes" on in the docs page header. Players never see it.
defineOptions({ inheritAttrs: false });
const __VLS_props = withDefaults(defineProps(), { as: 'div' });
const { visible } = useDocsAdminNotes();
const __VLS_defaults = { as: 'div' };
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
    __VLS_withDotValue(visible, {});
    void {};
    if (visible.value) {
        const __VLS_0 = (__VLS_ctx.as);
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            ...{ class: "admin-note" }, dataTestid: "admin-note",
        }));
        const __VLS_2 = __VLS_1({
            ...{ class: "admin-note" },
            dataTestid: "admin-note",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        (__VLS_ctx.$attrs);
        /** @type {__VLS_StyleScopedClasses['admin-note']} */ ;
        var __VLS_3;
        const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "admin-note-label" },
        });
        /** @type {__VLS_StyleScopedClasses['admin-note-label']} */ ;
        (__VLS_ctx.$t('docs.adminNotes.label'));
        var __VLS_6 = {};
        // @ts-ignore
        [visible, as, $attrs, $t,];
    }
    var __VLS_7 = __VLS_6;
    // @ts-ignore
    [];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
const __VLS_export = {};
export default {};

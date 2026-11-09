/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { dateTimePattern, parseDateTime } from '../../lib/dateTimeFormat';
const { defineModel, defineOptions, } = {};
// A text field for a local date and time in the UI language's own layout
// (see lib/dateTimeFormat.ts). The v-model is the text as typed; callers
// turn it into an ISO instant with `parseDateTime` when they save. Empty
// means "no date". Text that does not parse shows an inline error.
defineOptions({ inheritAttrs: false });
const model = defineModel({ required: true });
const { locale, t } = useI18n({ useScope: 'global' });
const pattern = computed(() => dateTimePattern(locale.value));
const invalid = computed(() => !parseDateTime(model.value, locale.value).ok);
let __VLS_modelEmit;
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(invalid, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "datetime-field" },
    });
    /** @type {__VLS_StyleScopedClasses['datetime-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_unwrap(model, {})),
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        placeholder: (__VLS_unwrap(pattern, {})),
        'aria-invalid': (invalid.value),
    });
    (__VLS_ctx.$attrs);
    if (invalid.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "datetime-error" },
            role: "alert",
        });
        /** @type {__VLS_StyleScopedClasses['datetime-error']} */ ;
        (__VLS_unwrap(t, {})('adminWorlds.dateInvalid', { pattern: __VLS_unwrap(pattern, {}) }));
    }
    // @ts-ignore
    [model, pattern, pattern, invalid, invalid, $attrs, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

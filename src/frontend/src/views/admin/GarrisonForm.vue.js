/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
const { defineProps, defineEmits, } = {};
const { t } = useI18n({ useScope: 'global' });
const props = defineProps();
const emit = defineEmits();
const catalogue = useUnitCatalogueStore();
void catalogue.load();
const unit = ref('');
const count = ref(10);
useUnsavedInput(() => count.value !== 10);
const saving = ref(false);
const error = ref(null);
const unitNames = computed(() => catalogue.definitions.map((d) => d.type));
// The catalogue arrives asynchronously; until it does, fall back to whatever
// already stands in this garrison so the form is never empty-and-unusable.
const options = computed(() => unitNames.value.length > 0 ? unitNames.value : props.garrison.map((s) => s.unit));
// The catalogue lands after mount, so the selection is made when the options
// first exist rather than at setup — otherwise the select renders with a value
// the model does not hold.
watch(options, (available) => {
    if (!available.includes(unit.value))
        unit.value = available[0] ?? '';
}, { immediate: true });
async function submit(sign) {
    if (saving.value || !unit.value)
        return;
    saving.value = true;
    error.value = null;
    try {
        const updated = await api.adminAdjustGarrison(props.settlementId, {
            unit: unit.value,
            count: sign * Math.abs(count.value),
        });
        emit('changed', updated);
    }
    catch (err) {
        error.value = err instanceof ApiError ? err.message : t('garrisonForm.changeError');
    }
    finally {
        saving.value = false;
    }
}
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
    __VLS_withDotValue(saving, {});
    __VLS_withDotValue(unit, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(options, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (...[$event]) => {
                void $event;
                return (submit(1));
            } },
        ...{ class: "garrison-form" },
    });
    /** @type {__VLS_StyleScopedClasses['garrison-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t('garrisonForm.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "standing" },
    });
    /** @type {__VLS_StyleScopedClasses['standing']} */ ;
    if (__VLS_ctx.garrison.length === 0) {
        (__VLS_ctx.$t('garrisonForm.empty'));
    }
    else {
        const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.garrison));
        for (const [stack] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (stack.unit),
                ...{ class: "stack" },
            });
            /** @type {__VLS_StyleScopedClasses['stack']} */ ;
            (stack.unit);
            (stack.count);
            // @ts-ignore
            [$t, $t, garrison, garrison,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "fields" },
    });
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('garrisonForm.unit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (unit.value),
    });
    const __VLS_1 = __VLS_tryAsConstant((options.value));
    for (const [name] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (name),
            value: (name),
        });
        (name);
        // @ts-ignore
        [$t, unit, options,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('garrisonForm.count'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        step: "1",
    });
    (__VLS_unwrap(count, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        disabled: (saving.value || !unit.value),
    });
    (saving.value ? __VLS_ctx.$t('garrisonForm.working') : __VLS_ctx.$t('garrisonForm.create'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (submit(-1));
                // @ts-ignore
                [$t, $t, $t, unit, count, saving, saving,];
            } },
        type: "button",
        ...{ class: "danger" },
        disabled: (saving.value || !unit.value),
    });
    /** @type {__VLS_StyleScopedClasses['danger']} */ ;
    (__VLS_ctx.$t('garrisonForm.remove'));
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    else if (options.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('garrisonForm.loadingRoster'));
    }
    // @ts-ignore
    [$t, $t, unit, options, saving, error, error,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

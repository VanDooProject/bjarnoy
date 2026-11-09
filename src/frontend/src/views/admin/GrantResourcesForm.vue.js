/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
const { defineProps, defineEmits, } = {};
const { t } = useI18n({ useScope: 'global' });
const props = defineProps();
const emit = defineEmits();
// Signed deltas: a negative value removes resources (see GrantResourcesRequest).
const deltas = reactive({ wood: 0, stone: 0, food: 0, iron: 0 });
useUnsavedInput(() => Object.values(deltas).some((delta) => delta !== 0));
const saving = ref(false);
const error = ref(null);
// Issue #98: a positive grant that `ResourcePool.Adjust` clamped to capacity
// server-side used to apply silently, making the admin think most of a
// grant "vanished". Report each clamped resource line instead.
const clampNotice = ref(null);
async function submit() {
    if (saving.value)
        return;
    saving.value = true;
    error.value = null;
    clampNotice.value = null;
    try {
        const requested = { ...deltas };
        const before = { ...props.before };
        const updated = await api.adminGrantResources(props.settlementId, requested);
        const clamped = [];
        for (const key of Object.keys(requested)) {
            const requestedDelta = requested[key];
            if (requestedDelta <= 0)
                continue; // capacity only clamps grants, not removals
            const actualDelta = updated.resources.stock[key] - before[key];
            if (actualDelta < requestedDelta - 0.5) {
                clamped.push(t('grantResourcesForm.clampLine', {
                    key,
                    actual: Math.floor(actualDelta),
                    requested: requestedDelta,
                    capacity: Math.floor(updated.resources.capacity[key]),
                }));
            }
        }
        clampNotice.value = clamped.length > 0 ? clamped.join('; ') : null;
        emit('granted', updated);
        deltas.wood = 0;
        deltas.stone = 0;
        deltas.food = 0;
        deltas.iron = 0;
    }
    catch (err) {
        error.value = err instanceof ApiError ? err.message : t('grantResourcesForm.grantError');
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
    __VLS_withDotValue(deltas, {});
    __VLS_withDotValue(saving, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(clampNotice, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (submit) },
        ...{ class: "grant-form" },
    });
    /** @type {__VLS_StyleScopedClasses['grant-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t('grantResourcesForm.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.$t('grantResourcesForm.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "fields" },
    });
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('grantResourcesForm.wood'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "1",
    });
    (deltas.value.wood);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('grantResourcesForm.stone'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "1",
    });
    (deltas.value.stone);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('grantResourcesForm.food'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "1",
    });
    (deltas.value.food);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('grantResourcesForm.iron'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "1",
    });
    (deltas.value.iron);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        disabled: (saving.value),
    });
    (saving.value ? __VLS_ctx.$t('grantResourcesForm.applying') : __VLS_ctx.$t('grantResourcesForm.apply'));
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    if (clampNotice.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "clamp-notice" },
        });
        /** @type {__VLS_StyleScopedClasses['clamp-notice']} */ ;
        (clampNotice.value);
    }
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, deltas, deltas, deltas, deltas, saving, saving, error, error, clampNotice, clampNotice,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

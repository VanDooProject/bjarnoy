/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
const { defineProps, } = {};
const { t, d } = useI18n({ useScope: 'global' });
const props = defineProps();
const armies = ref([]);
const loading = ref(false);
const loadError = ref(null);
const drafts = reactive({});
const openId = ref(null);
function editedFields(d) {
    return JSON.stringify([d.stacks, d.provisions, d.arriveInMinutes, d.q, d.r]);
}
// An open draft that differs from what the army currently is.
useUnsavedInput(() => armies.value.some((entry) => {
    const draft = drafts[entry.army.id];
    if (!draft)
        return false;
    return editedFields(draft) !== editedFields(draftFor(entry));
}));
function draftFor(entry) {
    return {
        stacks: entry.army.stacks.map((s) => ({ unit: s.unit, count: s.count })),
        provisions: Math.round(entry.army.provisions),
        arriveInMinutes: '',
        q: String(entry.army.position.q),
        r: String(entry.army.position.r),
        saving: false,
        error: null,
    };
}
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        armies.value = await api.adminListArmies({ settlementId: props.settlementId });
        for (const entry of armies.value) {
            drafts[entry.army.id] = draftFor(entry);
        }
    }
    catch {
        loadError.value = t('armyEditor.loadError');
    }
    finally {
        loading.value = false;
    }
}
watch(() => props.settlementId, load, { immediate: true });
function toggle(entry) {
    openId.value = openId.value === entry.army.id ? null : entry.army.id;
}
function where(entry) {
    if (entry.army.atHome)
        return t('armyEditor.where.atHome');
    if (entry.army.supporting)
        return t('armyEditor.where.supporting');
    return t('armyEditor.where.inTransit', {
        date: d(new Date(entry.army.movement.arrivesAt), 'long'),
    });
}
async function save(entry, options) {
    const draft = drafts[entry.army.id];
    if (!draft || draft.saving)
        return;
    draft.saving = true;
    draft.error = null;
    try {
        const updated = await api.adminEditArmy(entry.army.id, {
            units: draft.stacks.map((s) => ({ unit: s.unit, count: Number(s.count) || 0 })),
            provisions: Number(draft.provisions) || 0,
            ...(options.retime && draft.arriveInMinutes !== ''
                ? { arriveInMinutes: Number(draft.arriveInMinutes) }
                : {}),
            ...(options.move ? { position: { q: Number(draft.q), r: Number(draft.r) } } : {}),
        });
        const index = armies.value.findIndex((a) => a.army.id === updated.army.id);
        if (index !== -1)
            armies.value[index] = updated;
        drafts[updated.army.id] = draftFor(updated);
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('armyEditor.editError');
    }
    finally {
        draft.saving = false;
    }
}
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
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(armies, {});
    __VLS_withDotValue(openId, {});
    __VLS_withDotValue(drafts, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "army-editor" },
    });
    /** @type {__VLS_StyleScopedClasses['army-editor']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t('armyEditor.title'));
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('armyEditor.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (armies.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('armyEditor.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "armies" },
        });
        /** @type {__VLS_StyleScopedClasses['armies']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((armies.value));
        for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (entry.army.id),
                ...{ class: "army" },
            });
            /** @type {__VLS_StyleScopedClasses['army']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "summary" },
            });
            /** @type {__VLS_StyleScopedClasses['summary']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mission" },
            });
            /** @type {__VLS_StyleScopedClasses['mission']} */ ;
            (entry.army.mission);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "units" },
            });
            /** @type {__VLS_StyleScopedClasses['units']} */ ;
            (entry.army.stacks.map((s) => `${s.count}x ${s.unit}`).join(', ') || __VLS_ctx.$t('armyEditor.unitsEmpty'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "position" },
            });
            /** @type {__VLS_StyleScopedClasses['position']} */ ;
            (entry.army.position.q);
            (entry.army.position.r);
            (where(entry));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!!(armies.value.length === 0))
                            throw 0;
                        return (toggle(entry));
                        // @ts-ignore
                        [$t, $t, $t, $t, loading, loadError, loadError, armies, armies,];
                    } },
                type: "button",
            });
            (openId.value === entry.army.id ? __VLS_ctx.$t('armyEditor.close') : __VLS_ctx.$t('armyEditor.edit'));
            if (openId.value === entry.army.id && drafts.value[entry.army.id]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "edit" },
                });
                /** @type {__VLS_StyleScopedClasses['edit']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "stacks" },
                });
                /** @type {__VLS_StyleScopedClasses['stacks']} */ ;
                const __VLS_1 = __VLS_tryAsConstant((drafts.value[entry.army.id].stacks));
                for (const [stack, index] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                        key: (stack.unit),
                    });
                    (stack.unit);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        type: "number",
                        min: "0",
                        step: "1",
                    });
                    (drafts.value[entry.army.id].stacks[index].count);
                    // @ts-ignore
                    [$t, $t, openId, openId, drafts, drafts, drafts,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('armyEditor.provisions'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    min: "0",
                    step: "1",
                });
                (drafts.value[entry.army.id].provisions);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "controls" },
                });
                /** @type {__VLS_StyleScopedClasses['controls']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('armyEditor.arriveInMinutes'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    min: "0",
                    step: "1",
                });
                (drafts.value[entry.army.id].arriveInMinutes);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(armies.value.length === 0))
                                throw 0;
                            if (!(openId.value === entry.army.id && drafts.value[entry.army.id]))
                                throw 0;
                            return (save(entry, { move: false, retime: true }));
                            // @ts-ignore
                            [$t, $t, drafts, drafts,];
                        } },
                    type: "button",
                    disabled: (drafts.value[entry.army.id].saving),
                });
                (__VLS_ctx.$t('armyEditor.speedUp'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "controls" },
                });
                /** @type {__VLS_StyleScopedClasses['controls']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('armyEditor.coordQ'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    step: "1",
                });
                (drafts.value[entry.army.id].q);
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('armyEditor.coordR'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    step: "1",
                });
                (drafts.value[entry.army.id].r);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(armies.value.length === 0))
                                throw 0;
                            if (!(openId.value === entry.army.id && drafts.value[entry.army.id]))
                                throw 0;
                            return (save(entry, { move: true, retime: false }));
                            // @ts-ignore
                            [$t, $t, $t, drafts, drafts, drafts,];
                        } },
                    type: "button",
                    disabled: (drafts.value[entry.army.id].saving),
                });
                (__VLS_ctx.$t('armyEditor.moveHere'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(armies.value.length === 0))
                                throw 0;
                            if (!(openId.value === entry.army.id && drafts.value[entry.army.id]))
                                throw 0;
                            return (save(entry, { move: false, retime: false }));
                            // @ts-ignore
                            [$t, drafts,];
                        } },
                    type: "button",
                    disabled: (drafts.value[entry.army.id].saving),
                });
                (drafts.value[entry.army.id].saving ? __VLS_ctx.$t('armyEditor.saving') : __VLS_ctx.$t('armyEditor.saveUnitsAndFood'));
                if (drafts.value[entry.army.id].error) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['error']} */ ;
                    (drafts.value[entry.army.id].error);
                }
            }
            // @ts-ignore
            [$t, $t, drafts, drafts, drafts, drafts,];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};

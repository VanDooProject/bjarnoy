/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useAdminWorldStore } from '../../stores/adminWorld';
import ArmyEditor from './ArmyEditor.vue';
import GarrisonForm from './GarrisonForm.vue';
import GrantResourcesForm from './GrantResourcesForm.vue';
import SettlementLayoutEditor from './SettlementLayoutEditor.vue';
const { t } = useI18n({ useScope: 'global' });
const adminWorld = useAdminWorldStore();
const settlements = ref([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref(null);
const owner = ref('');
const open = ref({});
async function load() {
    // No world selected yet (worlds still loading, or none exist) — nothing to
    // search; the template shows a placeholder instead of an empty table.
    if (!adminWorld.selectedWorldId) {
        settlements.value = [];
        totalCount.value = 0;
        loading.value = false;
        return;
    }
    loading.value = true;
    loadError.value = null;
    try {
        const result = await api.adminSearchSettlements({
            worldId: adminWorld.selectedWorldId,
            owner: owner.value || undefined,
            page: page.value,
            pageSize,
        });
        settlements.value = result.items;
        totalCount.value = result.totalCount;
    }
    catch {
        loadError.value = t('adminSettlements.loadError');
    }
    finally {
        loading.value = false;
    }
}
// Reloads whenever the header's world selector changes — including its
// first resolution from AdminLayout's onMounted loadWorlds(), which this
// view's own onMounted can race ahead of.
watch(() => adminWorld.selectedWorldId, () => {
    page.value = 1;
    void load();
}, { immediate: true });
function onSearch() {
    page.value = 1;
    void load();
}
function changePage(delta) {
    const next = page.value + delta;
    if (next < 1)
        return;
    page.value = next;
    void load();
}
function applySummary(updated) {
    const index = settlements.value.findIndex((s) => s.id === updated.id);
    if (index !== -1) {
        settlements.value[index] = {
            ...settlements.value[index],
            longhouseLevel: updated.longhouseLevel,
        };
    }
}
// Background world ticks (resource production, queues) keep changing the
// open settlements' detail underneath the admin, so they're kept fresh on a
// timer while any is expanded, alongside a manual "Refresh" button for an
// on-demand nudge. Stopped whenever nothing is open/on unmount.
const DETAIL_POLL_MS = 10_000;
let detailPollHandle = null;
function stopDetailPolling() {
    if (detailPollHandle !== null) {
        clearInterval(detailPollHandle);
        detailPollHandle = null;
    }
}
function startDetailPolling() {
    if (detailPollHandle !== null)
        return;
    detailPollHandle = setInterval(() => {
        for (const id of Object.keys(open.value))
            void refreshDetail(id);
    }, DETAIL_POLL_MS);
}
async function refreshDetail(id) {
    const panel = open.value[id];
    if (!panel || panel.loading)
        return;
    try {
        const updated = await api.adminGetSettlement(id);
        if (!open.value[id])
            return;
        panel.detail = updated;
        applySummary(updated);
        panel.error = null;
    }
    catch (err) {
        if (open.value[id]) {
            panel.error = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
        }
    }
}
async function manage(settlement) {
    const id = settlement.id;
    if (open.value[id]) {
        delete open.value[id];
        if (Object.keys(open.value).length === 0)
            stopDetailPolling();
        return;
    }
    open.value[id] = { detail: null, loading: true, error: null };
    const panel = open.value[id];
    try {
        const loaded = await api.adminGetSettlement(id);
        if (open.value[id])
            panel.detail = loaded;
        startDetailPolling();
    }
    catch (err) {
        if (open.value[id]) {
            panel.error = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
        }
    }
    finally {
        if (open.value[id])
            panel.loading = false;
    }
}
function onChanged(id, updated) {
    const panel = open.value[id];
    if (panel)
        panel.detail = updated;
    applySummary(updated);
}
onBeforeUnmount(stopDetailPolling);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(adminWorld, {});
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(open, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['detail']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settlements" },
    });
    /** @type {__VLS_StyleScopedClasses['settlements']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminSettlements.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (onSearch) },
        value: (__VLS_unwrap(owner, {})),
        type: "text",
        placeholder: (__VLS_ctx.$t('adminSettlements.ownerPlaceholder')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (onSearch) },
    });
    (__VLS_ctx.$t('adminSettlements.search'));
    if (!adminWorld.value.selectedWorldId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminSettlements.selectWorldHint'));
    }
    else if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminSettlements.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.name'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.owner'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.world'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.position'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.longhouse'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminSettlements.columns.actions'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(settlements, {})));
        for (const [settlement] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (settlement.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlement.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlement.ownerName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlement.worldName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlement.q);
            (settlement.r);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlement.longhouseLevel);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            if (open.value[settlement.id]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(!adminWorld.value.selectedWorldId))
                                throw 0;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(open.value[settlement.id]))
                                throw 0;
                            return (refreshDetail(settlement.id));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, owner, adminWorld, loading, loadError, loadError, settlements, open,];
                        } },
                    disabled: (open.value[settlement.id].loading),
                });
                (__VLS_ctx.$t('adminSettlements.actions.refresh'));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(!adminWorld.value.selectedWorldId))
                            throw 0;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        return (manage(settlement));
                        // @ts-ignore
                        [$t, open,];
                    } },
            });
            (open.value[settlement.id] ? __VLS_ctx.$t('adminSettlements.actions.close') : __VLS_ctx.$t('adminSettlements.actions.manage'));
            if (open.value[settlement.id]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    ...{ class: "detail-row" },
                });
                /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "6",
                });
                if (open.value[settlement.id].loading) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                    (__VLS_ctx.$t('adminSettlements.loadingDetail'));
                }
                else if (open.value[settlement.id].error) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['error']} */ ;
                    (open.value[settlement.id].error);
                }
                else if (open.value[settlement.id].detail) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "detail" },
                    });
                    /** @type {__VLS_StyleScopedClasses['detail']} */ ;
                    const __VLS_1 = __VLS_tryAsConstant(([open.value[settlement.id].detail]));
                    for (const [detail] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                            key: (detail.id),
                        });
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "stocks" },
                        });
                        /** @type {__VLS_StyleScopedClasses['stocks']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('adminSettlements.stocks.wood', { stock: Math.floor(detail.resources.stock.wood), capacity: Math.floor(detail.resources.capacity.wood) }));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('adminSettlements.stocks.stone', { stock: Math.floor(detail.resources.stock.stone), capacity: Math.floor(detail.resources.capacity.stone) }));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('adminSettlements.stocks.food', { stock: Math.floor(detail.resources.stock.food), capacity: Math.floor(detail.resources.capacity.food) }));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('adminSettlements.stocks.iron', { stock: Math.floor(detail.resources.stock.iron), capacity: Math.floor(detail.resources.capacity.iron) }));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "forms" },
                        });
                        /** @type {__VLS_StyleScopedClasses['forms']} */ ;
                        const __VLS_2 = GrantResourcesForm;
                        // @ts-ignore
                        const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                            // @ts-ignore
                            ...{ 'onGranted': {} }, settlementId: (detail.id), before: (detail.resources.stock),
                        }));
                        const __VLS_4 = __VLS_3({
                            ...{ 'onGranted': {} },
                            settlementId: (detail.id),
                            before: (detail.resources.stock),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_3));
                        let __VLS_7;
                        const __VLS_8 = {
                            /** @type {typeof __VLS_7.granted} */
                            onGranted: (...[$event]) => {
                                void $event;
                                if (!!(!adminWorld.value.selectedWorldId))
                                    throw 0;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!(open.value[settlement.id]))
                                    throw 0;
                                if (!!(open.value[settlement.id].loading))
                                    throw 0;
                                if (!!(open.value[settlement.id].error))
                                    throw 0;
                                if (!(open.value[settlement.id].detail))
                                    throw 0;
                                return (onChanged(detail.id, $event));
                                // @ts-ignore
                                [$t, $t, $t, $t, $t, $t, $t, open, open, open, open, open, open, open,];
                            },
                        };
                        void __VLS_8;
                        var __VLS_5;
                        var __VLS_6;
                        const __VLS_9 = GarrisonForm;
                        // @ts-ignore
                        const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
                            // @ts-ignore
                            ...{ 'onChanged': {} }, settlementId: (detail.id), garrison: (detail.garrison),
                        }));
                        const __VLS_11 = __VLS_10({
                            ...{ 'onChanged': {} },
                            settlementId: (detail.id),
                            garrison: (detail.garrison),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
                        let __VLS_14;
                        const __VLS_15 = {
                            /** @type {typeof __VLS_14.changed} */
                            onChanged: (...[$event]) => {
                                void $event;
                                if (!!(!adminWorld.value.selectedWorldId))
                                    throw 0;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!(open.value[settlement.id]))
                                    throw 0;
                                if (!!(open.value[settlement.id].loading))
                                    throw 0;
                                if (!!(open.value[settlement.id].error))
                                    throw 0;
                                if (!(open.value[settlement.id].detail))
                                    throw 0;
                                return (onChanged(detail.id, $event));
                                // @ts-ignore
                                [];
                            },
                        };
                        void __VLS_15;
                        var __VLS_12;
                        var __VLS_13;
                        const __VLS_16 = SettlementLayoutEditor;
                        // @ts-ignore
                        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
                            // @ts-ignore
                            ...{ 'onChanged': {} }, settlementId: (detail.id), settlement: (detail),
                        }));
                        const __VLS_18 = __VLS_17({
                            ...{ 'onChanged': {} },
                            settlementId: (detail.id),
                            settlement: (detail),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
                        let __VLS_21;
                        const __VLS_22 = {
                            /** @type {typeof __VLS_21.changed} */
                            onChanged: (...[$event]) => {
                                void $event;
                                if (!!(!adminWorld.value.selectedWorldId))
                                    throw 0;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!(open.value[settlement.id]))
                                    throw 0;
                                if (!!(open.value[settlement.id].loading))
                                    throw 0;
                                if (!!(open.value[settlement.id].error))
                                    throw 0;
                                if (!(open.value[settlement.id].detail))
                                    throw 0;
                                return (onChanged(detail.id, $event));
                                // @ts-ignore
                                [];
                            },
                        };
                        void __VLS_22;
                        var __VLS_19;
                        var __VLS_20;
                        const __VLS_23 = ArmyEditor;
                        // @ts-ignore
                        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
                            // @ts-ignore
                            settlementId: (detail.id),
                        }));
                        const __VLS_25 = __VLS_24({
                            settlementId: (detail.id),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
                        // @ts-ignore
                        [];
                    }
                }
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pager" },
        });
        /** @type {__VLS_StyleScopedClasses['pager']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!adminWorld.value.selectedWorldId))
                        throw 0;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    return (changePage(-1));
                    // @ts-ignore
                    [];
                } },
            disabled: (__VLS_unwrap(page, {}) <= 1),
        });
        (__VLS_ctx.$t('adminSettlements.pager.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminSettlements.pager.summary', { page: __VLS_unwrap(page, {}), total: __VLS_unwrap(totalCount, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!adminWorld.value.selectedWorldId))
                        throw 0;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    return (changePage(1));
                    // @ts-ignore
                    [$t, $t, page, page, totalCount,];
                } },
            disabled: (__VLS_unwrap(page, {}) * __VLS_unwrap(pageSize, {}) >= __VLS_unwrap(totalCount, {})),
        });
        (__VLS_ctx.$t('adminSettlements.pager.next'));
    }
    // @ts-ignore
    [$t, page, totalCount, pageSize,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

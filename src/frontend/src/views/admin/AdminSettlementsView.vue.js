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
// The settlement currently expanded for management (grant/level forms), and
// its full detail — fetched separately since the search row is a summary.
const selectedId = ref(null);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref(null);
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
// open settlement's detail underneath the admin, so it's kept fresh on a
// timer while a settlement is expanded, alongside a manual "Refresh" button
// for an on-demand nudge. Stopped whenever nothing is selected/on unmount.
const DETAIL_POLL_MS = 10_000;
let detailPollHandle = null;
function stopDetailPolling() {
    if (detailPollHandle !== null) {
        clearInterval(detailPollHandle);
        detailPollHandle = null;
    }
}
function startDetailPolling() {
    stopDetailPolling();
    detailPollHandle = setInterval(() => void refreshDetail(), DETAIL_POLL_MS);
}
async function refreshDetail() {
    if (!selectedId.value || detailLoading.value)
        return;
    try {
        const updated = await api.adminGetSettlement(selectedId.value);
        detail.value = updated;
        applySummary(updated);
        detailError.value = null;
    }
    catch (err) {
        detailError.value = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
    }
}
async function manage(settlement) {
    if (selectedId.value === settlement.id) {
        selectedId.value = null;
        detail.value = null;
        stopDetailPolling();
        return;
    }
    selectedId.value = settlement.id;
    detail.value = null;
    detailError.value = null;
    detailLoading.value = true;
    try {
        detail.value = await api.adminGetSettlement(settlement.id);
        startDetailPolling();
    }
    catch (err) {
        detailError.value = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
    }
    finally {
        detailLoading.value = false;
    }
}
function onChanged(updated) {
    detail.value = updated;
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
    __VLS_withDotValue(selectedId, {});
    __VLS_withDotValue(detailLoading, {});
    __VLS_withDotValue(detailError, {});
    __VLS_withDotValue(detail, {});
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
            if (selectedId.value === settlement.id) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (refreshDetail) },
                    disabled: (detailLoading.value),
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
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, owner, adminWorld, loading, loadError, loadError, settlements, selectedId, detailLoading,];
                    } },
            });
            (selectedId.value === settlement.id ? __VLS_ctx.$t('adminSettlements.actions.close') : __VLS_ctx.$t('adminSettlements.actions.manage'));
            if (selectedId.value === settlement.id) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    ...{ class: "detail-row" },
                });
                /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "6",
                });
                if (detailLoading.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                    (__VLS_ctx.$t('adminSettlements.loadingDetail'));
                }
                else if (detailError.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['error']} */ ;
                    (detailError.value);
                }
                else if (detail.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "detail" },
                    });
                    /** @type {__VLS_StyleScopedClasses['detail']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "stocks" },
                    });
                    /** @type {__VLS_StyleScopedClasses['stocks']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_ctx.$t('adminSettlements.stocks.wood', { stock: Math.floor(detail.value.resources.stock.wood), capacity: Math.floor(detail.value.resources.capacity.wood) }));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_ctx.$t('adminSettlements.stocks.stone', { stock: Math.floor(detail.value.resources.stock.stone), capacity: Math.floor(detail.value.resources.capacity.stone) }));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_ctx.$t('adminSettlements.stocks.food', { stock: Math.floor(detail.value.resources.stock.food), capacity: Math.floor(detail.value.resources.capacity.food) }));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_ctx.$t('adminSettlements.stocks.iron', { stock: Math.floor(detail.value.resources.stock.iron), capacity: Math.floor(detail.value.resources.capacity.iron) }));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "forms" },
                    });
                    /** @type {__VLS_StyleScopedClasses['forms']} */ ;
                    const __VLS_1 = GrantResourcesForm;
                    // @ts-ignore
                    const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
                        // @ts-ignore
                        ...{ 'onGranted': {} }, settlementId: (detail.value.id), before: (detail.value.resources.stock),
                    }));
                    const __VLS_3 = __VLS_2({
                        ...{ 'onGranted': {} },
                        settlementId: (detail.value.id),
                        before: (detail.value.resources.stock),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_2));
                    let __VLS_6;
                    const __VLS_7 = {
                        /** @type {typeof __VLS_6.granted} */
                        onGranted: (onChanged),
                    };
                    void __VLS_7;
                    var __VLS_4;
                    var __VLS_5;
                    const __VLS_8 = GarrisonForm;
                    // @ts-ignore
                    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
                        // @ts-ignore
                        ...{ 'onChanged': {} }, settlementId: (detail.value.id), garrison: (detail.value.garrison),
                    }));
                    const __VLS_10 = __VLS_9({
                        ...{ 'onChanged': {} },
                        settlementId: (detail.value.id),
                        garrison: (detail.value.garrison),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
                    let __VLS_13;
                    const __VLS_14 = {
                        /** @type {typeof __VLS_13.changed} */
                        onChanged: (onChanged),
                    };
                    void __VLS_14;
                    var __VLS_11;
                    var __VLS_12;
                    const __VLS_15 = SettlementLayoutEditor;
                    // @ts-ignore
                    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
                        // @ts-ignore
                        ...{ 'onChanged': {} }, settlementId: (detail.value.id), settlement: (detail.value),
                    }));
                    const __VLS_17 = __VLS_16({
                        ...{ 'onChanged': {} },
                        settlementId: (detail.value.id),
                        settlement: (detail.value),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
                    let __VLS_20;
                    const __VLS_21 = {
                        /** @type {typeof __VLS_20.changed} */
                        onChanged: (onChanged),
                    };
                    void __VLS_21;
                    var __VLS_18;
                    var __VLS_19;
                    const __VLS_22 = ArmyEditor;
                    // @ts-ignore
                    const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                        // @ts-ignore
                        settlementId: (detail.value.id),
                    }));
                    const __VLS_24 = __VLS_23({
                        settlementId: (detail.value.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
                }
            }
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, selectedId, selectedId, detailLoading, detailError, detailError, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail, detail,];
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

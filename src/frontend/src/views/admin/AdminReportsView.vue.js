/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { profileLocation } from '../../lib/profileRoute';
const router = useRouter();
const { t, d } = useI18n({ useScope: 'global' });
const SOURCE_LABELS = computed(() => ({
    profileBio: t('adminReports.source.profileBio'),
    chatMessage: t('adminReports.source.chatMessage'),
}));
const reports = ref([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref(null);
const statusFilter = ref('pending');
const sourceTypeFilter = ref('');
const rows = reactive({});
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const result = await api.adminListReports({
            status: statusFilter.value || undefined,
            sourceType: sourceTypeFilter.value || undefined,
            page: page.value,
            pageSize,
        });
        reports.value = result.items;
        totalCount.value = result.totalCount;
        for (const report of reports.value) {
            rows[report.id] = { saving: false, error: null };
        }
    }
    catch {
        loadError.value = t('adminReports.loadError');
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
function onFilter() {
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
async function resolve(report, outcome) {
    const row = rows[report.id];
    if (!row || row.saving)
        return;
    row.saving = true;
    row.error = null;
    try {
        const updated = await api.adminResolveReport(report.id, { outcome });
        const index = reports.value.findIndex((r) => r.id === updated.id);
        if (index !== -1)
            reports.value[index] = updated;
    }
    catch (err) {
        row.error = err instanceof ApiError ? err.message : t('adminReports.updateError');
    }
    finally {
        row.saving = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(reports, {});
    __VLS_withDotValue(SOURCE_LABELS, {});
    __VLS_withDotValue(rows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reports" },
    });
    /** @type {__VLS_StyleScopedClasses['reports']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminReports.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (onFilter) },
        value: (__VLS_unwrap(statusFilter, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    (__VLS_ctx.$t('adminReports.filters.allStatuses'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "pending",
    });
    (__VLS_ctx.$t('adminReports.filters.pending'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "resolved",
    });
    (__VLS_ctx.$t('adminReports.filters.resolved'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "dismissed",
    });
    (__VLS_ctx.$t('adminReports.filters.dismissed'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "actioned",
    });
    (__VLS_ctx.$t('adminReports.filters.actioned'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (onFilter) },
        value: (__VLS_unwrap(sourceTypeFilter, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    (__VLS_ctx.$t('adminReports.filters.allSources'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "profileBio",
    });
    (__VLS_ctx.$t('adminReports.source.profileBio'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "chatMessage",
    });
    (__VLS_ctx.$t('adminReports.source.chatMessage'));
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminReports.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (reports.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('adminReports.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.source'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.reported'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.reporter'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.content'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.reason'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.note'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.status'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.created'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminReports.columns.actions'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_0 = __VLS_tryAsConstant((reports.value));
        for (const [report] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (report.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (SOURCE_LABELS.value[report.sourceType] ?? report.sourceType);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            let __VLS_1;
            /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
            routerLink;
            // @ts-ignore
            const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
                // @ts-ignore
                to: (__VLS_unwrap(profileLocation, {})(__VLS_unwrap(router, {}), report.reportedUserName)),
            }));
            const __VLS_3 = __VLS_2({
                to: (__VLS_unwrap(profileLocation, {})(__VLS_unwrap(router, {}), report.reportedUserName)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_2));
            var __VLS_4;
            const { default: __VLS_6 } = __VLS_nonNull(__VLS_4.slots);
            (report.reportedUserName);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, statusFilter, sourceTypeFilter, loading, loadError, loadError, reports, reports, SOURCE_LABELS, profileLocation, router,];
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (report.reporterUserName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "snapshot" },
            });
            /** @type {__VLS_StyleScopedClasses['snapshot']} */ ;
            (report.contextSnapshot);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (report.reason);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "note" },
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (report.note ?? __VLS_ctx.$t('adminReports.noNote'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: (['status', report.status]) },
            });
            /** @type {__VLS_StyleScopedClasses['status']} */ ;
            (report.status);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_unwrap(d, {})(new Date(report.createdAt), 'long'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "actions" },
            });
            /** @type {__VLS_StyleScopedClasses['actions']} */ ;
            if (report.status === 'pending') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(reports.value.length === 0))
                                throw 0;
                            if (!(report.status === 'pending'))
                                throw 0;
                            return (resolve(report, 'resolved'));
                            // @ts-ignore
                            [$t, d,];
                        } },
                    disabled: (rows.value[report.id]?.saving),
                });
                (__VLS_ctx.$t('adminReports.actions.resolve'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(reports.value.length === 0))
                                throw 0;
                            if (!(report.status === 'pending'))
                                throw 0;
                            return (resolve(report, 'dismissed'));
                            // @ts-ignore
                            [$t, rows,];
                        } },
                    disabled: (rows.value[report.id]?.saving),
                });
                (__VLS_ctx.$t('adminReports.actions.dismiss'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(reports.value.length === 0))
                                throw 0;
                            if (!(report.status === 'pending'))
                                throw 0;
                            return (resolve(report, 'actioned'));
                            // @ts-ignore
                            [$t, rows,];
                        } },
                    disabled: (rows.value[report.id]?.saving),
                });
                (__VLS_ctx.$t('adminReports.actions.actioned'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "muted" },
                });
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (__VLS_ctx.$t('adminReports.noActions'));
            }
            // @ts-ignore
            [$t, $t, rows,];
        }
        if (reports.value.some((r) => rows.value[r.id]?.error)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            const __VLS_7 = __VLS_tryAsConstant((reports.value));
            for (const [report] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (`err-${report.id}`),
                });
                if (rows.value[report.id]?.error) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (report.id);
                    (rows.value[report.id].error);
                }
                // @ts-ignore
                [reports, reports, rows, rows, rows,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pager" },
        });
        /** @type {__VLS_StyleScopedClasses['pager']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!!(reports.value.length === 0))
                        throw 0;
                    return (changePage(-1));
                    // @ts-ignore
                    [];
                } },
            disabled: (__VLS_unwrap(page, {}) <= 1),
        });
        (__VLS_ctx.$t('adminReports.pager.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminReports.pager.summary', { page: __VLS_unwrap(page, {}), total: __VLS_unwrap(totalCount, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!!(reports.value.length === 0))
                        throw 0;
                    return (changePage(1));
                    // @ts-ignore
                    [$t, $t, page, page, totalCount,];
                } },
            disabled: (__VLS_unwrap(page, {}) * __VLS_unwrap(pageSize, {}) >= __VLS_unwrap(totalCount, {})),
        });
        (__VLS_ctx.$t('adminReports.pager.next'));
    }
    // @ts-ignore
    [$t, page, totalCount, pageSize,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

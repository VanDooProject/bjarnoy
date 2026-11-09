/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import ActivityChart from '../../components/admin/ActivityChart.vue';
const { t, d } = useI18n({ useScope: 'global' });
function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}
function startOfDayIso(dateStr) {
    return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}
function endOfDayIso(dateStr) {
    return new Date(`${dateStr}T23:59:59.999Z`).toISOString();
}
// Default range: the last 7 days — a safe default under both the 92-day
// (bucket=day) and 7-day (bucket=hour) limits the backend enforces.
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
const rangeFrom = ref(toIsoDate(weekAgo));
const rangeTo = ref(toIsoDate(today));
const bucketUnit = ref('day');
// --- Aggregate summary -----------------------------------------------------
const buckets = ref([]);
const summaryLoading = ref(true);
const summaryError = ref(null);
async function loadSummary() {
    summaryLoading.value = true;
    summaryError.value = null;
    try {
        const result = await api.adminGetActivitySummary({
            from: startOfDayIso(rangeFrom.value),
            to: endOfDayIso(rangeTo.value),
            bucket: bucketUnit.value,
        });
        buckets.value = result.buckets;
    }
    catch (err) {
        summaryError.value = err instanceof ApiError ? err.message : t('adminActivity.loadSummaryError');
    }
    finally {
        summaryLoading.value = false;
    }
}
function setBucketUnit(unit) {
    if (bucketUnit.value === unit)
        return;
    bucketUnit.value = unit;
}
function onRangeChange() {
    void loadSummary();
    if (selectedUserId.value)
        void loadDetail(selectedUserId.value);
}
watch(bucketUnit, () => void loadSummary());
// --- Users table -------------------------------------------------------
const users = ref([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const usersLoading = ref(true);
const usersError = ref(null);
async function loadUsers() {
    usersLoading.value = true;
    usersError.value = null;
    try {
        const result = await api.adminListActivityUsers({ page: page.value, pageSize, sort: 'lastActive' });
        users.value = result.items;
        totalCount.value = result.totalCount;
    }
    catch (err) {
        usersError.value = err instanceof ApiError ? err.message : t('adminActivity.loadUsersError');
    }
    finally {
        usersLoading.value = false;
    }
}
function changePage(delta) {
    const next = page.value + delta;
    if (next < 1)
        return;
    page.value = next;
    void loadUsers();
}
// --- Per-user drill-down -------------------------------------------------
const selectedUserId = ref(null);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref(null);
async function loadDetail(userId) {
    detail.value = null;
    detailError.value = null;
    detailLoading.value = true;
    try {
        detail.value = await api.adminGetUserActivityDetail(userId, {
            from: startOfDayIso(rangeFrom.value),
            to: endOfDayIso(rangeTo.value),
        });
    }
    catch (err) {
        detailError.value = err instanceof ApiError ? err.message : t('adminActivity.loadDetailError');
    }
    finally {
        detailLoading.value = false;
    }
}
function selectUser(user) {
    if (selectedUserId.value === user.userId) {
        selectedUserId.value = null;
        detail.value = null;
        return;
    }
    selectedUserId.value = user.userId;
    void loadDetail(user.userId);
}
// `totalActiveDuration` comes across as a .NET TimeSpan string
// ("d.hh:mm:ss.fffffff", the day segment optional) — not a plain number of
// seconds — so parse that shape explicitly rather than risk misreading it.
function parseTimeSpanSeconds(value) {
    const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value);
    if (!match)
        return null;
    const [, days, hours, minutes, seconds, fraction] = match;
    const fractionalSeconds = fraction ? Number(`0.${fraction}`) : 0;
    return (Number(days ?? 0) * 86400 +
        Number(hours) * 3600 +
        Number(minutes) * 60 +
        Number(seconds) +
        fractionalSeconds);
}
function formatDuration(value) {
    const totalSeconds = parseTimeSpanSeconds(value);
    if (totalSeconds === null)
        return value;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0 && minutes === 0)
        return '<1m';
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function formatLastActive(iso) {
    return iso ? d(new Date(iso), 'long') : t('adminActivity.never');
}
const selectedUserName = computed(() => users.value.find((u) => u.userId === selectedUserId.value)?.userName ?? '');
onMounted(() => {
    void loadSummary();
    void loadUsers();
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(bucketUnit, {});
    __VLS_withDotValue(summaryLoading, {});
    __VLS_withDotValue(summaryError, {});
    __VLS_withDotValue(usersLoading, {});
    __VLS_withDotValue(usersError, {});
    __VLS_withDotValue(users, {});
    __VLS_withDotValue(selectedUserId, {});
    __VLS_withDotValue(detailLoading, {});
    __VLS_withDotValue(detailError, {});
    __VLS_withDotValue(detail, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['activity']} */ ;
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    /** @type {__VLS_StyleScopedClasses['bucket-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['bucket-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['user-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "activity" },
    });
    /** @type {__VLS_StyleScopedClasses['activity']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminActivity.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminActivity.filters.from'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (onRangeChange) },
        type: "date",
    });
    (__VLS_unwrap(rangeFrom, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminActivity.filters.to'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (onRangeChange) },
        type: "date",
    });
    (__VLS_unwrap(rangeTo, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bucket-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['bucket-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (setBucketUnit('day'));
                // @ts-ignore
                [$t, $t, $t, rangeFrom, rangeTo,];
            } },
        ...{ class: ({ active: bucketUnit.value === 'day' }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('adminActivity.filters.bucketDay'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (setBucketUnit('hour'));
                // @ts-ignore
                [$t, bucketUnit,];
            } },
        ...{ class: ({ active: bucketUnit.value === 'hour' }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('adminActivity.filters.bucketHour'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel-section" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('adminActivity.chart.title'));
    if (summaryLoading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminActivity.chart.loading'));
    }
    else if (summaryError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (summaryError.value);
    }
    else {
        const __VLS_0 = ActivityChart;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            buckets: (__VLS_unwrap(buckets, {})), bucketUnit: (bucketUnit.value),
        }));
        const __VLS_2 = __VLS_1({
            buckets: (__VLS_unwrap(buckets, {})),
            bucketUnit: (bucketUnit.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel-section" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('adminActivity.users.title'));
    if (usersLoading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminActivity.users.loading'));
    }
    else if (usersError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (usersError.value);
    }
    else if (users.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('adminActivity.users.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminActivity.users.columns.userName'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminActivity.users.columns.displayName'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminActivity.users.columns.lastActive'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_5 = __VLS_tryAsConstant((users.value));
        for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (user.userId),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(usersLoading.value))
                            throw 0;
                        if (!!(usersError.value))
                            throw 0;
                        if (!!(users.value.length === 0))
                            throw 0;
                        return (selectUser(user));
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, bucketUnit, bucketUnit, summaryLoading, summaryError, summaryError, buckets, usersLoading, usersError, usersError, users, users,];
                    } },
                ...{ class: "user-row" },
            });
            /** @type {__VLS_StyleScopedClasses['user-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (user.userName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (user.displayName ?? __VLS_ctx.$t('adminActivity.users.noDisplayName'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (formatLastActive(user.lastActiveAtUtc));
            if (selectedUserId.value === user.userId) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    ...{ class: "detail-row" },
                });
                /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "3",
                });
                if (detailLoading.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                    (__VLS_ctx.$t('adminActivity.detail.loading'));
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
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "totals" },
                    });
                    /** @type {__VLS_StyleScopedClasses['totals']} */ ;
                    (__VLS_unwrap(t, {})('adminActivity.detail.totals', {
                        userName: __VLS_unwrap(selectedUserName, {}),
                        sessions: __VLS_unwrap(t, {})('adminActivity.detail.sessionCount', { count: detail.value.sessionCount }),
                        duration: formatDuration(detail.value.totalActiveDuration),
                    }));
                    if (detail.value.sessions.length === 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "muted" },
                        });
                        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                        (__VLS_ctx.$t('adminActivity.detail.empty'));
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                            ...{ class: "sessions" },
                        });
                        /** @type {__VLS_StyleScopedClasses['sessions']} */ ;
                        const __VLS_6 = __VLS_tryAsConstant((detail.value.sessions));
                        for (const [session, index] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                                key: (index),
                            });
                            (__VLS_unwrap(d, {})(new Date(session.startedAtUtc), 'long'));
                            (__VLS_unwrap(d, {})(new Date(session.lastSeenAtUtc), 'long'));
                            // @ts-ignore
                            [$t, $t, $t, selectedUserId, detailLoading, detailError, detailError, detail, detail, detail, detail, detail, t, t, selectedUserName, d, d,];
                        }
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
                    if (!!(usersLoading.value))
                        throw 0;
                    if (!!(usersError.value))
                        throw 0;
                    if (!!(users.value.length === 0))
                        throw 0;
                    return (changePage(-1));
                    // @ts-ignore
                    [];
                } },
            disabled: (__VLS_unwrap(page, {}) <= 1),
        });
        (__VLS_ctx.$t('adminActivity.pager.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminActivity.pager.summary', { page: __VLS_unwrap(page, {}), total: __VLS_unwrap(totalCount, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(usersLoading.value))
                        throw 0;
                    if (!!(usersError.value))
                        throw 0;
                    if (!!(users.value.length === 0))
                        throw 0;
                    return (changePage(1));
                    // @ts-ignore
                    [$t, $t, page, page, totalCount,];
                } },
            disabled: (__VLS_unwrap(page, {}) * __VLS_unwrap(pageSize, {}) >= __VLS_unwrap(totalCount, {})),
        });
        (__VLS_ctx.$t('adminActivity.pager.next'));
    }
    // @ts-ignore
    [$t, page, totalCount, pageSize,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

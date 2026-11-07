/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
const { t, d } = useI18n({ useScope: 'global' });
const auth = useAuthStore();
const users = ref([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref(null);
const search = ref('');
const statusFilter = ref('');
const drafts = reactive({});
function draftFor(user) {
    return {
        displayName: user.displayName ?? '',
        role: user.role,
        saving: false,
        error: null,
    };
}
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const result = await api.adminListUsers({
            search: search.value || undefined,
            status: statusFilter.value || undefined,
            page: page.value,
            pageSize,
        });
        users.value = result.items;
        totalCount.value = result.totalCount;
        for (const user of users.value) {
            drafts[user.id] = draftFor(user);
        }
    }
    catch {
        loadError.value = t('adminUsers.loadError');
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
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
function applyUpdated(updated) {
    const index = users.value.findIndex((u) => u.id === updated.id);
    if (index !== -1)
        users.value[index] = updated;
    drafts[updated.id] = draftFor(updated);
}
async function saveEdit(user) {
    const draft = drafts[user.id];
    if (!draft || draft.saving)
        return;
    draft.saving = true;
    draft.error = null;
    try {
        const updated = await api.adminUpdateUser(user.id, {
            displayName: draft.displayName,
            role: draft.role,
        });
        applyUpdated(updated);
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('adminUsers.saveError');
    }
    finally {
        draft.saving = false;
    }
}
const STATUS_LABELS = computed(() => ({
    active: t('adminUsers.statusLabels.active'),
    locked: t('adminUsers.statusLabels.locked'),
    banned: t('adminUsers.statusLabels.banned'),
}));
function isSelf(user) {
    return auth.user?.id === user.id;
}
async function setStatus(user, status) {
    const draft = drafts[user.id];
    if (!draft || draft.saving || isSelf(user))
        return;
    const label = STATUS_LABELS.value[status] ?? status;
    if (!window.confirm(t('adminUsers.confirmStatusChange', { label, userName: user.userName })))
        return;
    const reason = status === 'active' ? null : window.prompt(t('adminUsers.reasonPrompt')) ?? undefined;
    draft.saving = true;
    draft.error = null;
    try {
        const updated = await api.adminSetUserStatus(user.id, { status, reason: reason ?? undefined });
        applyUpdated(updated);
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('adminUsers.statusError');
    }
    finally {
        draft.saving = false;
    }
}
// Issue #40 phase 7: the fight simulator's `PremiumUserEndpointFilter` gate
// had no admin control to flip — this is that control, mirroring `setStatus`
// above exactly (same per-row draft/saving/error plumbing).
async function togglePremium(user) {
    const draft = drafts[user.id];
    if (!draft || draft.saving)
        return;
    draft.saving = true;
    draft.error = null;
    try {
        const updated = await api.adminSetUserPremium(user.id, { isPremium: !user.isPremium });
        applyUpdated(updated);
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('adminUsers.premiumError');
    }
    finally {
        draft.saving = false;
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
    __VLS_withDotValue(drafts, {});
    __VLS_withDotValue(users, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "users" },
    });
    /** @type {__VLS_StyleScopedClasses['users']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminUsers.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (onSearch) },
        value: (__VLS_unwrap(search, {})),
        type: "text",
        placeholder: (__VLS_ctx.$t('adminUsers.searchPlaceholder')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (onSearch) },
        value: (__VLS_unwrap(statusFilter, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    (__VLS_ctx.$t('adminUsers.filters.allStatuses'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "active",
    });
    (__VLS_ctx.$t('adminUsers.filters.active'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "locked",
    });
    (__VLS_ctx.$t('adminUsers.filters.locked'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "banned",
    });
    (__VLS_ctx.$t('adminUsers.filters.banned'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (onSearch) },
    });
    (__VLS_ctx.$t('adminUsers.search'));
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminUsers.loading'));
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
        (__VLS_ctx.$t('adminUsers.columns.userName'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.displayName'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.role'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.status'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.premium'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.settlements'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.created'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.lastLogin'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminUsers.columns.actions'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_0 = __VLS_tryAsConstant((users.value));
        for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (user.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (user.userName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                value: (drafts.value[user.id].displayName),
                type: "text",
                ...{ class: "cell-input" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (drafts.value[user.id].role),
                ...{ class: "cell-input" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "player",
            });
            (__VLS_ctx.$t('adminUsers.roles.player'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "admin",
            });
            (__VLS_ctx.$t('adminUsers.roles.admin'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: (['status', user.status]) },
            });
            /** @type {__VLS_StyleScopedClasses['status']} */ ;
            (user.status);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        return (togglePremium(user));
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, search, statusFilter, loading, loadError, loadError, users, drafts, drafts,];
                    } },
                type: "button",
                ...{ class: "premium-toggle" },
                disabled: (drafts.value[user.id]?.saving),
            });
            /** @type {__VLS_StyleScopedClasses['premium-toggle']} */ ;
            (user.isPremium ? __VLS_ctx.$t('adminUsers.premium.revoke') : __VLS_ctx.$t('adminUsers.premium.grant'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (user.settlementCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_unwrap(d, {})(new Date(user.createdAt), 'short'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (user.lastLoginAt ? __VLS_unwrap(d, {})(new Date(user.lastLoginAt), 'long') : __VLS_ctx.$t('adminUsers.noLastLogin'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "actions" },
            });
            /** @type {__VLS_StyleScopedClasses['actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        return (saveEdit(user));
                        // @ts-ignore
                        [$t, $t, $t, drafts, d, d,];
                    } },
                disabled: (drafts.value[user.id]?.saving),
            });
            (__VLS_ctx.$t('adminUsers.actions.save'));
            if (user.status !== 'active') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(user.status !== 'active'))
                                throw 0;
                            return (setStatus(user, 'active'));
                            // @ts-ignore
                            [$t, drafts,];
                        } },
                    disabled: (drafts.value[user.id]?.saving || isSelf(user)),
                });
                (__VLS_ctx.$t('adminUsers.actions.unlockUnban'));
            }
            if (user.status !== 'locked') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(user.status !== 'locked'))
                                throw 0;
                            return (setStatus(user, 'locked'));
                            // @ts-ignore
                            [$t, drafts,];
                        } },
                    disabled: (drafts.value[user.id]?.saving || isSelf(user)),
                    title: (isSelf(user) ? __VLS_ctx.$t('adminUsers.cannotLockSelf') : undefined),
                });
                (__VLS_ctx.$t('adminUsers.actions.lock'));
            }
            if (user.status !== 'banned') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(user.status !== 'banned'))
                                throw 0;
                            return (setStatus(user, 'banned'));
                            // @ts-ignore
                            [$t, $t, drafts,];
                        } },
                    disabled: (drafts.value[user.id]?.saving || isSelf(user)),
                    title: (isSelf(user) ? __VLS_ctx.$t('adminUsers.cannotBanSelf') : undefined),
                });
                (__VLS_ctx.$t('adminUsers.actions.ban'));
            }
            // @ts-ignore
            [$t, $t, drafts,];
        }
        if (drafts.value && users.value.some((u) => drafts.value[u.id]?.error)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((users.value));
            for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (`err-${user.id}`),
                });
                if (drafts.value[user.id]?.error) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (user.userName);
                    (drafts.value[user.id].error);
                }
                // @ts-ignore
                [users, users, drafts, drafts, drafts, drafts,];
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
                    return (changePage(-1));
                    // @ts-ignore
                    [];
                } },
            disabled: (__VLS_unwrap(page, {}) <= 1),
        });
        (__VLS_ctx.$t('adminUsers.pager.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminUsers.pager.summary', { page: __VLS_unwrap(page, {}), total: __VLS_unwrap(totalCount, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
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
        (__VLS_ctx.$t('adminUsers.pager.next'));
    }
    // @ts-ignore
    [$t, page, totalCount, pageSize,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

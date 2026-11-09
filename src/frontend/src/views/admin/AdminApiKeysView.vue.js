/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import ApiKeyScopeEditor from '../../components/admin/ApiKeyScopeEditor.vue';
// Admin tab for debug API keys (docs/tech/api-keys.md): the open requests an
// agent filed (the approval link it hands the admin is
// `/admin/api-keys?request=<userCode>`, which highlights and scrolls to that
// request), and the keys themselves. Create / edit / approve all go through
// the shared scope editor; a freshly minted token is shown exactly once.
const { t, d } = useI18n({ useScope: 'global' });
const route = useRoute();
const auth = useAuthStore();
const features = ref([]);
const worlds = ref([]);
const keys = ref([]);
const requests = ref([]);
const includeInactive = ref(false);
const loading = ref(true);
const loadError = ref(null);
const editor = ref(null);
const editorBusy = ref(false);
const editorError = ref(null);
const actionError = ref(null);
const revealed = ref(null);
const copied = ref(false);
const hintNotes = ref({});
const highlightedCode = computed(() => {
    const raw = route.query.request;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? value.trim().toUpperCase() : null;
});
function matchesCode(code) {
    return highlightedCode.value !== null && !!code && code.toUpperCase() === highlightedCode.value;
}
function isHighlighted(request) {
    return matchesCode(request.userCode);
}
// A request that was collected is no longer listed under Requests: its link opens the key it became.
function isKeyHighlighted(key) {
    return matchesCode(key.requestUserCode);
}
async function scrollToHighlighted() {
    await nextTick();
    const el = document.querySelector('[data-highlighted="true"]');
    if (el && typeof el.scrollIntoView === 'function')
        el.scrollIntoView({ block: 'center' });
}
async function loadRequests() {
    requests.value = await api.adminListApiKeyRequests();
}
async function loadKeys() {
    keys.value = await api.adminListApiKeys(includeInactive.value);
}
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const [featureList, worldList] = await Promise.all([api.getApiKeyFeatures(), api.adminListWorlds()]);
        features.value = featureList;
        worlds.value = worldList;
        await Promise.all([loadRequests(), loadKeys()]);
    }
    catch {
        loadError.value = t('adminApiKeys.loadError');
    }
    finally {
        loading.value = false;
    }
    await revealHighlightedKey();
    await scrollToHighlighted();
}
/** The linked request's key may be expired or revoked, which the key list hides by default. */
async function revealHighlightedKey() {
    const code = highlightedCode.value;
    if (!code || includeInactive.value)
        return;
    const open = requests.value.some((r) => isHighlighted(r));
    if (open || keys.value.some((k) => isKeyHighlighted(k)))
        return;
    includeInactive.value = true;
    try {
        await loadKeys();
    }
    catch {
        loadError.value = t('adminApiKeys.loadError');
    }
}
onMounted(load);
watch(highlightedCode, () => void revealHighlightedKey().then(scrollToHighlighted));
watch(includeInactive, () => void loadKeys().catch(() => (loadError.value = t('adminApiKeys.loadError'))));
function selfOwner() {
    return {
        id: auth.user?.id ?? '',
        userName: auth.user?.userName ?? '',
        role: auth.user?.role ?? 'player',
    };
}
/**
 * Resolves a name an agent gave, the way the backend does on approval: an exact user name, else the one account or
 * account-less player whose jarl or settlement name is exactly this (e.g. the nickname `Jarl-a741`). Several matches are
 * reported as ambiguous, never guessed; null when nothing matches.
 */
async function resolveHint(name) {
    const wanted = name?.trim().toLowerCase();
    if (!wanted)
        return null;
    try {
        const hits = await api.adminLookupUsers(wanted);
        const byUser = hits.find((u) => u.kind === 'user' && u.userName.toLowerCase() === wanted);
        const matches = byUser ? [byUser] : hits.filter((u) => u.matchedName?.toLowerCase() === wanted);
        if (matches.length > 1)
            return { kind: 'ambiguous', count: matches.length };
        const hit = matches[0];
        if (!hit)
            return null;
        if (hit.kind === 'anonymous') {
            return {
                kind: 'anonymous',
                account: {
                    settlementId: hit.settlementId ?? undefined,
                    label: hit.userName,
                    primary: false,
                    settlementName: hit.settlementName,
                    worldName: hit.worldName,
                },
            };
        }
        return { kind: 'user', owner: { id: hit.userId, userName: hit.userName, role: hit.role } };
    }
    catch {
        return null;
    }
}
/** Looks a user up by exact user name (an existing key's owner). */
async function resolveOwner(userName) {
    const hint = await resolveHint(userName);
    return hint?.kind === 'user' ? hint.owner : null;
}
function toEditorAccount(a) {
    return { id: a.userId, userName: a.userName, role: a.role };
}
function openNew() {
    actionError.value = null;
    editorError.value = null;
    editor.value = {
        kind: 'new',
        initial: {
            owner: selfOwner(),
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
    };
}
async function openEdit(key) {
    actionError.value = null;
    editorError.value = null;
    const found = await resolveOwner(key.ownerUserName);
    const owner = found ?? {
        id: key.ownerUserId,
        userName: key.ownerUserName,
        role: Object.keys(key.features).some((id) => id.startsWith('admin.')) ? 'admin' : 'player',
    };
    editor.value = {
        kind: 'edit',
        key,
        initial: {
            name: key.name,
            purpose: key.purpose,
            owner,
            additionalAccounts: (key.additionalAccounts ?? []).map(toEditorAccount),
            anonymousAccounts: (key.anonymousAccounts ?? []).map((a) => ({
                id: a.id,
                label: a.label,
                primary: a.isPrimary,
                settlementName: a.settlementName,
                worldName: a.worldName,
                claimed: a.claimed,
            })),
            ownerCanAct: key.ownerCanAct ?? true,
            features: key.features,
            allWorlds: key.allWorlds,
            worldIds: key.worldIds,
            expiresAt: key.expiresAt,
            requestsPerMinute: key.requestsPerMinute,
        },
    };
}
async function openApprove(request) {
    actionError.value = null;
    editorError.value = null;
    const notes = [];
    const ownerHint = await resolveHint(request.requestedOwnerUserName);
    let owner = selfOwner();
    const anonymous = [];
    let ownerCanAct = true;
    if (ownerHint?.kind === 'user')
        owner = ownerHint.owner;
    else if (ownerHint?.kind === 'anonymous') {
        // A player without an account: the key acts as them and the approving admin is only the sponsor.
        anonymous.push({ ...ownerHint.account, primary: true });
        ownerCanAct = false;
    }
    else if (ownerHint?.kind === 'ambiguous') {
        notes.push(t('adminApiKeys.requests.ambiguous', { name: request.requestedOwnerUserName ?? '', n: ownerHint.count }));
    }
    const additional = [];
    if (request.approved) {
        additional.push(...request.approved.additionalAccounts.map(toEditorAccount));
        anonymous.length = 0;
        anonymous.push(...request.approved.anonymousAccounts.map((a) => ({
            settlementId: a.settlementId ?? undefined,
            label: a.label,
            primary: a.isPrimary,
        })));
        ownerCanAct = request.approved.ownerCanAct;
    }
    else {
        for (const name of request.requestedAdditionalUserNames) {
            const hint = await resolveHint(name);
            if (hint?.kind === 'user' && hint.owner.id !== owner.id)
                additional.push(hint.owner);
            else if (hint?.kind === 'anonymous')
                anonymous.push(hint.account);
            else if (hint?.kind === 'ambiguous')
                notes.push(t('adminApiKeys.requests.ambiguous', { name, n: hint.count }));
        }
    }
    hintNotes.value = { ...hintNotes.value, [request.id]: notes };
    editor.value = {
        kind: 'approve',
        request,
        initial: {
            owner,
            additionalAccounts: additional,
            anonymousAccounts: anonymous,
            ownerCanAct,
            features: request.features,
            allWorlds: request.allWorlds,
            worldIds: request.worldIds,
            lifetimeMinutes: request.lifetimeMinutes,
            requestsPerMinute: request.requestsPerMinute,
            autoRenewMinutes: null,
        },
    };
}
function closeEditor() {
    editor.value = null;
    editorError.value = null;
}
function errorMessage(err, fallback) {
    return err instanceof ApiError ? err.message : fallback;
}
async function onEditorSubmit(payload) {
    const state = editor.value;
    if (!state || editorBusy.value)
        return;
    editorBusy.value = true;
    editorError.value = null;
    try {
        if (state.kind === 'new') {
            revealed.value = await api.adminCreateApiKey(payload);
            copied.value = false;
        }
        else if (state.kind === 'edit') {
            await api.adminUpdateApiKey(state.key.id, payload);
        }
        else {
            await api.adminApproveApiKeyRequest(state.request.id, payload);
        }
        editor.value = null;
        await Promise.all([loadKeys(), loadRequests()]);
    }
    catch (err) {
        editorError.value = errorMessage(err, t('adminApiKeys.saveError'));
    }
    finally {
        editorBusy.value = false;
    }
}
async function deny(request) {
    if (!window.confirm(t('adminApiKeys.confirmDeny', { name: request.name })))
        return;
    actionError.value = null;
    try {
        await api.adminDenyApiKeyRequest(request.id);
        await loadRequests();
    }
    catch (err) {
        actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
    }
}
async function recreate(key) {
    if (!window.confirm(t('adminApiKeys.confirmRecreate', { name: key.name })))
        return;
    actionError.value = null;
    try {
        revealed.value = await api.adminRecreateApiKey(key.id);
        copied.value = false;
        await loadKeys();
    }
    catch (err) {
        actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
    }
}
async function revoke(key) {
    if (!window.confirm(t('adminApiKeys.confirmRevoke', { name: key.name })))
        return;
    actionError.value = null;
    try {
        await api.adminRevokeApiKey(key.id);
        await loadKeys();
    }
    catch (err) {
        actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
    }
}
async function copyToken() {
    if (!revealed.value)
        return;
    try {
        await navigator.clipboard.writeText(revealed.value.token);
        copied.value = true;
    }
    catch {
        copied.value = false;
    }
}
const ACCESS_SHORT = { None: '', Read: 'r', ReadWrite: 'rw' };
function featureSummary(map) {
    return Object.entries(map)
        .filter(([, level]) => level !== 'None')
        .map(([id, level]) => `${id}:${ACCESS_SHORT[level]}`)
        .join(', ');
}
function worldSummary(scope) {
    if (scope.allWorlds)
        return t('adminApiKeys.allWorlds');
    if (scope.worldIds.length === 0)
        return t('adminApiKeys.noWorlds');
    return scope.worldIds.map((id) => worlds.value.find((w) => w.id === id)?.name ?? id.slice(0, 8)).join(', ');
}
function lifetimeLabel(minutes) {
    return minutes % 1440 === 0
        ? t('adminApiKeys.lifetime.days', { n: minutes / 1440 })
        : minutes % 60 === 0
            ? t('adminApiKeys.lifetime.hours', { n: minutes / 60 })
            : t('adminApiKeys.lifetime.minutes', { n: minutes });
}
const openRequests = computed(() => requests.value.filter((r) => r.status === 'Pending' || r.status === 'Approved'));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(revealed, {});
    __VLS_withDotValue(copied, {});
    __VLS_withDotValue(actionError, {});
    __VLS_withDotValue(openRequests, {});
    __VLS_withDotValue(hintNotes, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(keys, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['api-keys']} */ ;
    /** @type {__VLS_StyleScopedClasses['request']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['keys-head']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['highlight']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['token-box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "api-keys" },
    });
    /** @type {__VLS_StyleScopedClasses['api-keys']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminApiKeys.title'));
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminApiKeys.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else {
        if (revealed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "token-box" },
                'data-testid': "token-box",
            });
            /** @type {__VLS_StyleScopedClasses['token-box']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('adminApiKeys.token.title', { name: revealed.value.apiKey.name }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "warning" },
            });
            /** @type {__VLS_StyleScopedClasses['warning']} */ ;
            (__VLS_ctx.$t('adminApiKeys.token.warning'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                ...{ class: "token" },
                'data-testid': "token-value",
            });
            /** @type {__VLS_StyleScopedClasses['token']} */ ;
            (revealed.value.token);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "actions" },
            });
            /** @type {__VLS_StyleScopedClasses['actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (copyToken) },
                type: "button",
                'data-testid': "token-copy",
            });
            (copied.value ? __VLS_ctx.$t('adminApiKeys.token.copied') : __VLS_ctx.$t('adminApiKeys.token.copy'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(revealed.value))
                            throw 0;
                        return (revealed.value = null);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, loading, loadError, loadError, revealed, revealed, revealed, revealed, copied,];
                    } },
                type: "button",
            });
            (__VLS_ctx.$t('adminApiKeys.token.dismiss'));
        }
        if (actionError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
                'data-testid': "action-error",
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (actionError.value);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "requests" },
        });
        /** @type {__VLS_StyleScopedClasses['requests']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminApiKeys.requests.title'));
        if (openRequests.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('adminApiKeys.requests.empty'));
        }
        const __VLS_0 = __VLS_tryAsConstant((openRequests.value));
        for (const [request] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
                key: (request.id),
                ...{ class: (['request', { highlight: isHighlighted(request) }]) },
                'data-highlighted': (isHighlighted(request) ? 'true' : 'false'),
                'data-testid': (`request-${request.userCode}`),
            });
            /** @type {__VLS_StyleScopedClasses['highlight']} */ ;
            /** @type {__VLS_StyleScopedClasses['request']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "request-head" },
            });
            /** @type {__VLS_StyleScopedClasses['request-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "code" },
            });
            /** @type {__VLS_StyleScopedClasses['code']} */ ;
            (request.userCode);
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (request.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (__VLS_ctx.$t(`adminApiKeys.requestKind.${request.kind}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (__VLS_ctx.$t(`adminApiKeys.requestStatus.${request.status}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
                ...{ class: "facts" },
            });
            /** @type {__VLS_StyleScopedClasses['facts']} */ ;
            if (request.purpose) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('adminApiKeys.requests.purpose'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (request.purpose);
            }
            if (request.description) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('adminApiKeys.requests.description'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (request.description);
            }
            if (request.contextUrl) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('adminApiKeys.requests.context'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
                    href: (request.contextUrl),
                    target: "_blank",
                    rel: "noopener noreferrer",
                });
                (request.contextUrl);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_ctx.$t('adminApiKeys.requests.requester'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (request.requesterIp);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (request.requesterUserAgent);
            if (request.requestedOwnerUserName) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('adminApiKeys.requests.owner'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (request.requestedOwnerUserName);
            }
            if (request.requestedAdditionalUserNames.length > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('adminApiKeys.requests.accounts'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (request.requestedAdditionalUserNames.join(', '));
            }
            if ((hintNotes.value[request.id] ?? []).length > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
                    ...{ class: "error" },
                    'data-testid': "hint-notes",
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (hintNotes.value[request.id].join(' '));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_ctx.$t('adminApiKeys.requests.features'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (featureSummary(request.features));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_ctx.$t('adminApiKeys.requests.worlds'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (worldSummary(request));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_ctx.$t('adminApiKeys.requests.lifetime'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (lifetimeLabel(request.lifetimeMinutes));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_ctx.$t('adminApiKeys.requests.expires'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (__VLS_unwrap(d, {})(new Date(request.expiresAt), 'long'));
            if (request.status === 'Pending') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
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
                            if (!(request.status === 'Pending'))
                                throw 0;
                            return (openApprove(request));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, actionError, actionError, openRequests, openRequests, hintNotes, hintNotes, d,];
                        } },
                    type: "button",
                    'data-testid': (`approve-${request.userCode}`),
                });
                (__VLS_ctx.$t('adminApiKeys.requests.approve'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(request.status === 'Pending'))
                                throw 0;
                            return (deny(request));
                            // @ts-ignore
                            [$t,];
                        } },
                    type: "button",
                    ...{ class: "danger" },
                    'data-testid': (`deny-${request.userCode}`),
                });
                /** @type {__VLS_StyleScopedClasses['danger']} */ ;
                (__VLS_ctx.$t('adminApiKeys.requests.deny'));
            }
            if (editor.value?.kind === 'approve' && editor.value.request.id === request.id) {
                const __VLS_1 = ApiKeyScopeEditor;
                // @ts-ignore
                const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
                    // @ts-ignore
                    ...{ 'onSubmit': {} }, ...{ 'onCancel': {} }, mode: "approve", features: (__VLS_unwrap(features, {})), worlds: (__VLS_unwrap(worlds, {})), initial: (editor.value.initial), busy: (__VLS_unwrap(editorBusy, {})), error: (__VLS_unwrap(editorError, {})),
                }));
                const __VLS_3 = __VLS_2({
                    ...{ 'onSubmit': {} },
                    ...{ 'onCancel': {} },
                    mode: "approve",
                    features: (__VLS_unwrap(features, {})),
                    worlds: (__VLS_unwrap(worlds, {})),
                    initial: (editor.value.initial),
                    busy: (__VLS_unwrap(editorBusy, {})),
                    error: (__VLS_unwrap(editorError, {})),
                }, ...__VLS_functionalComponentArgsRest(__VLS_2));
                let __VLS_6;
                const __VLS_7 = {
                    /** @type {typeof __VLS_6.submit} */
                    onSubmit: (onEditorSubmit),
                };
                void __VLS_7;
                const __VLS_8 = {
                    /** @type {typeof __VLS_6.cancel} */
                    onCancel: (closeEditor),
                };
                void __VLS_8;
                var __VLS_4;
                var __VLS_5;
            }
            // @ts-ignore
            [$t, editor, editor, editor, features, worlds, editorBusy, editorError,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "keys" },
        });
        /** @type {__VLS_StyleScopedClasses['keys']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "keys-head" },
        });
        /** @type {__VLS_StyleScopedClasses['keys-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminApiKeys.keys.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "inline" },
        });
        /** @type {__VLS_StyleScopedClasses['inline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
            'data-testid': "include-inactive",
        });
        (__VLS_unwrap(includeInactive, {}));
        (__VLS_ctx.$t('adminApiKeys.keys.includeInactive'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (openNew) },
            type: "button",
            'data-testid': "new-key",
        });
        (__VLS_ctx.$t('adminApiKeys.keys.new'));
        if (editor.value && editor.value.kind !== 'approve') {
            const __VLS_9 = ApiKeyScopeEditor;
            // @ts-ignore
            const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
                // @ts-ignore
                ...{ 'onSubmit': {} }, ...{ 'onCancel': {} }, key: (editor.value.kind === 'edit' ? editor.value.key.id : 'new'), mode: "key", features: (__VLS_unwrap(features, {})), worlds: (__VLS_unwrap(worlds, {})), initial: (editor.value.initial), busy: (__VLS_unwrap(editorBusy, {})), error: (__VLS_unwrap(editorError, {})),
            }));
            const __VLS_11 = __VLS_10({
                ...{ 'onSubmit': {} },
                ...{ 'onCancel': {} },
                key: (editor.value.kind === 'edit' ? editor.value.key.id : 'new'),
                mode: "key",
                features: (__VLS_unwrap(features, {})),
                worlds: (__VLS_unwrap(worlds, {})),
                initial: (editor.value.initial),
                busy: (__VLS_unwrap(editorBusy, {})),
                error: (__VLS_unwrap(editorError, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_10));
            let __VLS_14;
            const __VLS_15 = {
                /** @type {typeof __VLS_14.submit} */
                onSubmit: (onEditorSubmit),
            };
            void __VLS_15;
            const __VLS_16 = {
                /** @type {typeof __VLS_14.cancel} */
                onCancel: (closeEditor),
            };
            void __VLS_16;
            var __VLS_12;
            var __VLS_13;
        }
        if (keys.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('adminApiKeys.keys.empty'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "table" },
            });
            /** @type {__VLS_StyleScopedClasses['table']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.name'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.hint'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.request'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.owner'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.accounts'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.createdBy'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.status'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.expires'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.lastUsed'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.features'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.worlds'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminApiKeys.keys.columns.actions'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_17 = __VLS_tryAsConstant((keys.value));
            for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_17))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (key.id),
                    ...{ class: ({ highlight: isKeyHighlighted(key) }) },
                    'data-highlighted': (isKeyHighlighted(key) ? 'true' : 'false'),
                    'data-testid': (`key-${key.id}`),
                });
                /** @type {__VLS_StyleScopedClasses['highlight']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (key.name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
                (key.keyHint);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                if (key.requestUserCode) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                        'data-testid': (`key-request-${key.id}`),
                    });
                    (key.requestUserCode);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (key.ownerUserName);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "summary" },
                });
                /** @type {__VLS_StyleScopedClasses['summary']} */ ;
                ([
                    ...(key.additionalAccounts ?? []).map((a) => a.userName),
                    ...(key.anonymousAccounts ?? []).map((a) => `${a.label} (${__VLS_ctx.$t('adminApiKeys.editor.anonymousBadge')}${a.claimed ? ', ' + __VLS_ctx.$t('adminApiKeys.keys.claimed') : ''})`),
                ].join(', '));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (key.createdByUserName ?? '');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: (['status', key.status.toLowerCase()]) },
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                (__VLS_ctx.$t(`adminApiKeys.keyStatus.${key.status}`));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_unwrap(d, {})(new Date(key.expiresAt), 'long'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (key.lastUsedAt ? __VLS_unwrap(d, {})(new Date(key.lastUsedAt), 'long') : __VLS_ctx.$t('adminApiKeys.keys.neverUsed'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "summary" },
                });
                /** @type {__VLS_StyleScopedClasses['summary']} */ ;
                (featureSummary(key.features));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "summary" },
                });
                /** @type {__VLS_StyleScopedClasses['summary']} */ ;
                (worldSummary(key));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "actions" },
                });
                /** @type {__VLS_StyleScopedClasses['actions']} */ ;
                if (key.status !== 'Revoked') {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!!(keys.value.length === 0))
                                    throw 0;
                                if (!(key.status !== 'Revoked'))
                                    throw 0;
                                return (openEdit(key));
                                // @ts-ignore
                                [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, d, d, editor, editor, editor, editor, editor, features, worlds, editorBusy, editorError, includeInactive, keys, keys,];
                            } },
                        type: "button",
                        'data-testid': (`edit-${key.id}`),
                    });
                    (__VLS_ctx.$t('adminApiKeys.keys.edit'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!!(keys.value.length === 0))
                                    throw 0;
                                if (!(key.status !== 'Revoked'))
                                    throw 0;
                                return (recreate(key));
                                // @ts-ignore
                                [$t,];
                            } },
                        type: "button",
                        'data-testid': (`recreate-${key.id}`),
                    });
                    (__VLS_ctx.$t('adminApiKeys.keys.recreate'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(loading.value))
                                    throw 0;
                                if (!!(loadError.value))
                                    throw 0;
                                if (!!(keys.value.length === 0))
                                    throw 0;
                                if (!(key.status !== 'Revoked'))
                                    throw 0;
                                return (revoke(key));
                                // @ts-ignore
                                [$t,];
                            } },
                        type: "button",
                        ...{ class: "danger" },
                        'data-testid': (`revoke-${key.id}`),
                    });
                    /** @type {__VLS_StyleScopedClasses['danger']} */ ;
                    (__VLS_ctx.$t('adminApiKeys.keys.revoke'));
                }
                // @ts-ignore
                [$t,];
            }
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

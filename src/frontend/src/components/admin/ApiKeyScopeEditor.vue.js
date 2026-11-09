/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import UserLookupInput from './UserLookupInput.vue';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: 'global' });
const ACCESS_LEVELS = ['None', 'Read', 'ReadWrite'];
function toLocalInput(iso) {
    const date = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const form = reactive({
    name: props.initial.name ?? '',
    purpose: props.initial.purpose ?? '',
    owner: { ...props.initial.owner },
    additional: (props.initial.additionalAccounts ?? []).map((a) => ({ ...a })),
    anonymous: (props.initial.anonymousAccounts ?? []).map((a) => ({ ...a })),
    ownerCanAct: props.initial.ownerCanAct ?? true,
    features: { ...(props.initial.features ?? {}) },
    allWorlds: props.initial.allWorlds ?? false,
    worldIds: [...(props.initial.worldIds ?? [])],
    expiresAtLocal: toLocalInput(props.initial.expiresAt),
    lifetimeMinutes: props.initial.lifetimeMinutes ?? 60,
    requestsPerMinute: props.initial.requestsPerMinute ?? null,
    autoRenewMinutes: props.initial.autoRenewMinutes ?? null,
});
// Admin features need an admin owner who can act: an anonymous account has no admin rights.
const ownerIsAdmin = computed(() => form.owner.role.toLowerCase() === 'admin' && form.ownerCanAct);
function accessOf(id) {
    return form.features[id] ?? 'None';
}
function setAccess(id, level) {
    form.features[id] = level;
}
// Admin features only make sense for an admin owner (the backend rejects the
// rest): switching to a non-admin owner drops any admin grant instead of
// leaving a hidden one that would fail on submit.
watch(ownerIsAdmin, (isAdmin) => {
    if (isAdmin)
        return;
    for (const feature of props.features) {
        if (feature.admin)
            form.features[feature.id] = 'None';
    }
});
function anonymousKey(a) {
    return a.id ?? a.settlementId ?? a.label;
}
function addAnonymous(user, primary) {
    if (form.anonymous.some((a) => a.settlementId === user.settlementId && user.settlementId))
        return;
    form.anonymous.push({
        settlementId: user.settlementId ?? undefined,
        label: user.userName,
        primary,
        settlementName: user.settlementName,
        worldName: user.worldName,
    });
}
function pickOwner(user) {
    if (user.kind === 'anonymous') {
        // A player without an account cannot own a key: the key acts as them, the owner stays the sponsor.
        addAnonymous(user, form.anonymous.length === 0);
        form.ownerCanAct = false;
        return;
    }
    form.owner = { id: user.userId, userName: user.userName, role: user.role };
    // The owner is already an account of the key: it never also sits in the extra list.
    form.additional = form.additional.filter((a) => a.id !== user.userId);
}
function addAccount(user) {
    if (user.kind === 'anonymous') {
        addAnonymous(user, form.anonymous.length === 0 && !form.ownerCanAct);
        return;
    }
    const id = user.userId;
    if (id === form.owner.id || form.additional.some((a) => a.id === id))
        return;
    form.additional.push({ id, userName: user.userName, role: user.role });
}
function removeAccount(id) {
    form.additional = form.additional.filter((a) => a.id !== id);
}
function removeAnonymous(key) {
    form.anonymous = form.anonymous.filter((a) => anonymousKey(a) !== key);
    if (form.anonymous.length === 0)
        form.ownerCanAct = true;
    else if (!form.anonymous.some((a) => a.primary))
        form.anonymous[0].primary = true;
}
function makePrimary(key) {
    for (const a of form.anonymous)
        a.primary = anonymousKey(a) === key;
}
const takenAccountIds = computed(() => [
    form.owner.id,
    ...form.additional.map((a) => a.id),
    ...form.anonymous.map((a) => a.settlementId).filter((id) => !!id),
]);
function pickSelf() {
    form.owner = { ...props.initial.owner };
}
function toggleWorld(id) {
    const index = form.worldIds.indexOf(id);
    if (index === -1)
        form.worldIds.push(id);
    else
        form.worldIds.splice(index, 1);
}
const selectedFeatures = computed(() => {
    const out = {};
    for (const feature of props.features) {
        const level = accessOf(feature.id);
        if (level !== 'None')
            out[feature.id] = level;
    }
    return out;
});
const validationError = computed(() => {
    if (props.mode === 'key' && form.name.trim() === '')
        return t('adminApiKeys.editor.errors.nameRequired');
    if (Object.keys(selectedFeatures.value).length === 0)
        return t('adminApiKeys.editor.errors.featureRequired');
    const worldScoped = props.features.some((f) => f.worldScoped && accessOf(f.id) !== 'None');
    if (worldScoped && !form.allWorlds && form.worldIds.length === 0) {
        return t('adminApiKeys.editor.errors.worldRequired');
    }
    return null;
});
function anonymousBody() {
    return {
        anonymousAccounts: form.anonymous.map((a) => ({ id: a.id, settlementId: a.settlementId, primary: a.primary })),
        ownerCanAct: form.ownerCanAct,
    };
}
function submit() {
    if (validationError.value || props.busy)
        return;
    const scope = {
        features: selectedFeatures.value,
        allWorlds: form.allWorlds,
        worldIds: form.allWorlds ? [] : [...form.worldIds],
    };
    const rpm = form.requestsPerMinute ? Number(form.requestsPerMinute) : null;
    if (props.mode === 'key') {
        const body = {
            name: form.name.trim(),
            purpose: form.purpose.trim() || null,
            ownerUserId: form.owner.id,
            additionalUserIds: form.additional.map((a) => a.id),
            ...anonymousBody(),
            ...scope,
            expiresAt: new Date(form.expiresAtLocal).toISOString(),
            requestsPerMinute: rpm,
        };
        emit('submit', body);
    }
    else {
        const renew = form.autoRenewMinutes ? Number(form.autoRenewMinutes) : null;
        const body = {
            ownerUserId: form.owner.id,
            additionalUserIds: form.additional.map((a) => a.id),
            ...anonymousBody(),
            ...scope,
            lifetimeMinutes: Number(form.lifetimeMinutes),
            requestsPerMinute: rpm,
            autoRenewMinutes: renew,
        };
        emit('submit', body);
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
    __VLS_withDotValue(form, {});
    __VLS_withDotValue(ownerIsAdmin, {});
    __VLS_withDotValue(validationError, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (submit) },
        ...{ class: "editor" },
        'data-testid': "scope-editor",
    });
    /** @type {__VLS_StyleScopedClasses['editor']} */ ;
    if (__VLS_ctx.mode === 'key') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminApiKeys.editor.name'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            value: (form.value.name),
            type: "text",
            maxlength: "100",
            'data-testid': "editor-name",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminApiKeys.editor.purpose'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            value: (form.value.purpose),
            type: "text",
            maxlength: "500",
            'data-testid': "editor-purpose",
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
        ...{ class: "owner" },
    });
    /** @type {__VLS_StyleScopedClasses['owner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
    (form.value.ownerCanAct ? __VLS_ctx.$t('adminApiKeys.editor.owner') : __VLS_ctx.$t('adminApiKeys.editor.ownerSponsor'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "owner-current" },
        'data-testid': "editor-owner",
    });
    /** @type {__VLS_StyleScopedClasses['owner-current']} */ ;
    (form.value.owner.userName);
    if (ownerIsAdmin.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge" },
        });
        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
        (__VLS_ctx.$t('adminApiKeys.editor.adminBadge'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "owner-search" },
    });
    /** @type {__VLS_StyleScopedClasses['owner-search']} */ ;
    const __VLS_0 = UserLookupInput;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onPick': {} }, placeholder: (__VLS_ctx.$t('adminApiKeys.editor.ownerSearch')), testid: "editor-owner",
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onPick': {} },
        placeholder: (__VLS_ctx.$t('adminApiKeys.editor.ownerSearch')),
        testid: "editor-owner",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.pick} */
        onPick: (pickOwner),
    };
    void __VLS_6;
    var __VLS_3;
    var __VLS_4;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (pickSelf) },
        type: "button",
        'data-testid': "editor-owner-self",
    });
    (__VLS_ctx.$t('adminApiKeys.editor.ownerSelf'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
        ...{ class: "accounts" },
    });
    /** @type {__VLS_StyleScopedClasses['accounts']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
    (__VLS_ctx.$t('adminApiKeys.editor.accounts'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_ctx.$t('adminApiKeys.editor.accountsHint'));
    if (form.value.additional.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "chips" },
            'data-testid': "editor-accounts",
        });
        /** @type {__VLS_StyleScopedClasses['chips']} */ ;
        const __VLS_7 = __VLS_tryAsConstant((form.value.additional));
        for (const [account] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (account.id),
                ...{ class: "chip" },
            });
            /** @type {__VLS_StyleScopedClasses['chip']} */ ;
            (account.userName);
            if (account.role.toLowerCase() === 'admin') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge" },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                (__VLS_ctx.$t('adminApiKeys.editor.adminBadge'));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(form.value.additional.length > 0))
                            throw 0;
                        return (removeAccount(account.id));
                        // @ts-ignore
                        [mode, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, form, form, form, form, form, form, ownerIsAdmin,];
                    } },
                type: "button",
                'aria-label': (__VLS_ctx.$t('adminApiKeys.editor.removeAccount', { name: account.userName })),
                'data-testid': (`account-remove-${account.id}`),
            });
            // @ts-ignore
            [$t,];
        }
    }
    if (form.value.anonymous.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "chips" },
            'data-testid': "editor-anonymous",
        });
        /** @type {__VLS_StyleScopedClasses['chips']} */ ;
        const __VLS_8 = __VLS_tryAsConstant((form.value.anonymous));
        for (const [account] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (anonymousKey(account)),
                ...{ class: (['chip', 'anonymous', { claimed: account.claimed }]) },
                'data-testid': (`anonymous-${anonymousKey(account)}`),
            });
            /** @type {__VLS_StyleScopedClasses['claimed']} */ ;
            /** @type {__VLS_StyleScopedClasses['chip']} */ ;
            /** @type {__VLS_StyleScopedClasses['anonymous']} */ ;
            (account.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (__VLS_ctx.$t('adminApiKeys.editor.anonymousBadge'));
            if (account.settlementName) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "muted" },
                });
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (account.settlementName);
                if (account.worldName) {
                    (account.worldName);
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
            (__VLS_ctx.$t('adminApiKeys.editor.anonymousHeader', { label: account.label }));
            if (!account.primary && !form.value.ownerCanAct) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(form.value.anonymous.length > 0))
                                throw 0;
                            if (!(!account.primary && !form.value.ownerCanAct))
                                throw 0;
                            return (makePrimary(anonymousKey(account)));
                            // @ts-ignore
                            [$t, $t, form, form, form,];
                        } },
                    type: "button",
                    'data-testid': (`anonymous-primary-${anonymousKey(account)}`),
                });
                (__VLS_ctx.$t('adminApiKeys.editor.makePrimary', { name: account.label }));
            }
            else if (account.primary && !form.value.ownerCanAct) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge" },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                (__VLS_ctx.$t('adminApiKeys.editor.anonymousPrimary'));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(form.value.anonymous.length > 0))
                            throw 0;
                        return (removeAnonymous(anonymousKey(account)));
                        // @ts-ignore
                        [$t, $t, form,];
                    } },
                type: "button",
                'aria-label': (__VLS_ctx.$t('adminApiKeys.editor.removeAccount', { name: account.label })),
                'data-testid': (`anonymous-remove-${anonymousKey(account)}`),
            });
            if (account.claimed) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "warn" },
                });
                /** @type {__VLS_StyleScopedClasses['warn']} */ ;
                (__VLS_ctx.$t('adminApiKeys.editor.claimedWarning'));
            }
            // @ts-ignore
            [$t, $t,];
        }
    }
    if (form.value.anonymous.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "inline" },
        });
        /** @type {__VLS_StyleScopedClasses['inline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
            'data-testid': "editor-owner-can-act",
        });
        (form.value.ownerCanAct);
        (__VLS_ctx.$t('adminApiKeys.editor.ownerCanAct'));
    }
    if (!form.value.ownerCanAct) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('adminApiKeys.editor.ownerCanActOff'));
    }
    const __VLS_9 = UserLookupInput;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
        // @ts-ignore
        ...{ 'onPick': {} }, placeholder: (__VLS_ctx.$t('adminApiKeys.editor.accountSearch')), exclude: (__VLS_unwrap(takenAccountIds, {})), testid: "editor-account",
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onPick': {} },
        placeholder: (__VLS_ctx.$t('adminApiKeys.editor.accountSearch')),
        exclude: (__VLS_unwrap(takenAccountIds, {})),
        testid: "editor-account",
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_14;
    const __VLS_15 = {
        /** @type {typeof __VLS_14.pick} */
        onPick: (addAccount),
    };
    void __VLS_15;
    var __VLS_12;
    var __VLS_13;
    __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
        ...{ class: "features" },
    });
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
    (__VLS_ctx.$t('adminApiKeys.editor.features'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "grid" },
    });
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('adminApiKeys.editor.feature'));
    const __VLS_16 = __VLS_tryAsConstant((__VLS_unwrap(ACCESS_LEVELS, {})));
    for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (level),
        });
        (__VLS_ctx.$t(`adminApiKeys.access.${level}`));
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, form, form, form, takenAccountIds, ACCESS_LEVELS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_17 = __VLS_tryAsConstant((__VLS_ctx.features));
    for (const [feature] of __VLS_vFor(__VLS_nonNull(__VLS_17))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (feature.id),
            ...{ class: ({ disabled: feature.admin && !ownerIsAdmin.value }) },
        });
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
        (feature.id);
        if (feature.worldScoped) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (__VLS_ctx.$t('adminApiKeys.editor.worldScoped'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (feature.description);
        const __VLS_18 = __VLS_tryAsConstant((__VLS_unwrap(ACCESS_LEVELS, {})));
        for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_18))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (level),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        return (setAccess(feature.id, level));
                        // @ts-ignore
                        [$t, ownerIsAdmin, ACCESS_LEVELS, features,];
                    } },
                type: "radio",
                name: (`feature-${feature.id}`),
                checked: (accessOf(feature.id) === level),
                disabled: (feature.admin && !ownerIsAdmin.value),
                'data-testid': (`feature-${feature.id}-${level}`),
            });
            // @ts-ignore
            [ownerIsAdmin,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
        ...{ class: "worlds" },
    });
    /** @type {__VLS_StyleScopedClasses['worlds']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
    (__VLS_ctx.$t('adminApiKeys.editor.worlds'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "inline" },
    });
    /** @type {__VLS_StyleScopedClasses['inline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        'data-testid': "editor-all-worlds",
    });
    (form.value.allWorlds);
    (__VLS_ctx.$t('adminApiKeys.editor.allWorlds'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "world-list" },
    });
    /** @type {__VLS_StyleScopedClasses['world-list']} */ ;
    const __VLS_19 = __VLS_tryAsConstant((__VLS_ctx.worlds));
    for (const [world] of __VLS_vFor(__VLS_nonNull(__VLS_19))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (world.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "inline" },
        });
        /** @type {__VLS_StyleScopedClasses['inline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    return (toggleWorld(world.id));
                    // @ts-ignore
                    [$t, $t, form, worlds,];
                } },
            type: "checkbox",
            checked: (form.value.worldIds.includes(world.id)),
            disabled: (form.value.allWorlds),
            'data-testid': (`editor-world-${world.id}`),
        });
        (world.name);
        // @ts-ignore
        [form, form,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    if (__VLS_ctx.mode === 'key') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminApiKeys.editor.expiresAt'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "datetime-local",
            'data-testid': "editor-expires",
        });
        (form.value.expiresAtLocal);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminApiKeys.editor.lifetimeMinutes'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "1",
            'data-testid': "editor-lifetime",
        });
        (form.value.lifetimeMinutes);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.$t('adminApiKeys.editor.requestsPerMinute'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        'data-testid': "editor-rpm",
    });
    (form.value.requestsPerMinute);
    if (__VLS_ctx.mode === 'approve') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('adminApiKeys.editor.autoRenewMinutes'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            'data-testid': "editor-auto-renew",
        });
        (form.value.autoRenewMinutes);
    }
    if (validationError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
            'data-testid': "editor-validation",
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (validationError.value);
    }
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
            'data-testid': "editor-error",
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "primary" },
        disabled: (__VLS_ctx.busy || validationError.value !== null),
        'data-testid': "editor-submit",
    });
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    (__VLS_ctx.mode === 'approve' ? __VLS_ctx.$t('adminApiKeys.editor.approve') : __VLS_ctx.$t('adminApiKeys.editor.save'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('cancel'));
                // @ts-ignore
                [mode, mode, mode, $t, $t, $t, $t, $t, $t, form, form, form, form, validationError, validationError, validationError, error, error, busy, emit,];
            } },
        type: "button",
    });
    (__VLS_ctx.$t('adminApiKeys.editor.cancel'));
    // @ts-ignore
    [$t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

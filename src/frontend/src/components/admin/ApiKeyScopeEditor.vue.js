/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../api/client';
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
    features: { ...(props.initial.features ?? {}) },
    allWorlds: props.initial.allWorlds ?? false,
    worldIds: [...(props.initial.worldIds ?? [])],
    expiresAtLocal: toLocalInput(props.initial.expiresAt),
    lifetimeMinutes: props.initial.lifetimeMinutes ?? 60,
    requestsPerMinute: props.initial.requestsPerMinute ?? null,
    autoRenewMinutes: props.initial.autoRenewMinutes ?? null,
});
const ownerIsAdmin = computed(() => form.owner.role.toLowerCase() === 'admin');
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
// Owner search.
const ownerSearch = ref('');
const ownerResults = ref([]);
const ownerSearching = ref(false);
async function searchOwners() {
    ownerSearching.value = true;
    try {
        const result = await api.adminListUsers({ search: ownerSearch.value || undefined, pageSize: 10 });
        ownerResults.value = result.items;
    }
    catch {
        ownerResults.value = [];
    }
    finally {
        ownerSearching.value = false;
    }
}
function pickOwner(user) {
    form.owner = { id: user.id, userName: user.userName, role: user.role };
    ownerResults.value = [];
    ownerSearch.value = '';
}
function pickSelf() {
    form.owner = { ...props.initial.owner };
    ownerResults.value = [];
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
    __VLS_withDotValue(ownerResults, {});
    __VLS_withDotValue(validationError, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
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
    (__VLS_ctx.$t('adminApiKeys.editor.owner'));
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (searchOwners) },
        value: (__VLS_unwrap(ownerSearch, {})),
        type: "text",
        placeholder: (__VLS_ctx.$t('adminApiKeys.editor.ownerSearch')),
        'data-testid': "editor-owner-search",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (searchOwners) },
        type: "button",
        disabled: (__VLS_unwrap(ownerSearching, {})),
    });
    (__VLS_ctx.$t('adminApiKeys.editor.searchButton'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (pickSelf) },
        type: "button",
        'data-testid': "editor-owner-self",
    });
    (__VLS_ctx.$t('adminApiKeys.editor.ownerSelf'));
    if (ownerResults.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "owner-results" },
        });
        /** @type {__VLS_StyleScopedClasses['owner-results']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((ownerResults.value));
        for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (user.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(ownerResults.value.length > 0))
                            throw 0;
                        return (pickOwner(user));
                        // @ts-ignore
                        [mode, $t, $t, $t, $t, $t, $t, $t, form, form, form, ownerIsAdmin, ownerSearch, ownerSearching, ownerResults, ownerResults,];
                    } },
                type: "button",
                'data-testid': (`owner-pick-${user.id}`),
            });
            (user.userName);
            (user.role);
            // @ts-ignore
            [];
        }
    }
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
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(ACCESS_LEVELS, {})));
    for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (level),
        });
        (__VLS_ctx.$t(`adminApiKeys.access.${level}`));
        // @ts-ignore
        [$t, $t, $t, ACCESS_LEVELS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_2 = __VLS_tryAsConstant((__VLS_ctx.features));
    for (const [feature] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
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
        const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(ACCESS_LEVELS, {})));
        for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
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
    const __VLS_4 = __VLS_tryAsConstant((__VLS_ctx.worlds));
    for (const [world] of __VLS_vFor(__VLS_nonNull(__VLS_4))) {
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

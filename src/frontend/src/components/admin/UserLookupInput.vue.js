/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../../api/client';
const { defineProps, defineEmits, withDefaults, } = {};
const props = withDefaults(defineProps(), { placeholder: '', exclude: () => [], testid: 'user-lookup' });
const emit = defineEmits();
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const query = ref('');
const results = ref([]);
const open = ref(false);
const active = ref(-1);
let timer = null;
let controller = null;
function cancelPending() {
    if (timer)
        clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
}
async function run(text) {
    controller = new AbortController();
    const mine = controller;
    try {
        const found = await api.adminLookupUsers(text, mine.signal);
        if (controller !== mine)
            return;
        results.value = found.filter((u) => !props.exclude.includes((u.userId ?? u.settlementId)));
    }
    catch {
        if (controller !== mine)
            return;
        results.value = [];
    }
    active.value = results.value.length > 0 ? 0 : -1;
    open.value = true;
}
watch(query, (text) => {
    cancelPending();
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
        results.value = [];
        open.value = false;
        return;
    }
    timer = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
});
function choose(user) {
    cancelPending();
    emit('pick', user);
    query.value = '';
    results.value = [];
    open.value = false;
}
function onKeydown(event) {
    if (event.key === 'Escape') {
        open.value = false;
    }
    else if (event.key === 'ArrowDown' && results.value.length > 0) {
        event.preventDefault();
        open.value = true;
        active.value = (active.value + 1) % results.value.length;
    }
    else if (event.key === 'ArrowUp' && results.value.length > 0) {
        event.preventDefault();
        active.value = (active.value - 1 + results.value.length) % results.value.length;
    }
    else if (event.key === 'Enter') {
        event.preventDefault();
        const user = results.value[active.value];
        if (open.value && user)
            choose(user);
    }
}
onBeforeUnmount(cancelPending);
const __VLS_defaults = { placeholder: '', exclude: () => [], testid: 'user-lookup' };
void __VLS_defaults;
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
    __VLS_withDotValue(open, {});
    __VLS_withDotValue(results, {});
    __VLS_withDotValue(active, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['lookup']} */ ;
    /** @type {__VLS_StyleScopedClasses['results']} */ ;
    /** @type {__VLS_StyleScopedClasses['results']} */ ;
    /** @type {__VLS_StyleScopedClasses['results']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lookup" },
    });
    /** @type {__VLS_StyleScopedClasses['lookup']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (onKeydown) },
        ...{ onBlur: (...[$event]) => {
                void $event;
                return (open.value = false);
                // @ts-ignore
                [open,];
            } },
        value: (__VLS_unwrap(query, {})),
        type: "text",
        role: "combobox",
        autocomplete: "off",
        'aria-autocomplete': "list",
        'aria-expanded': (open.value && results.value.length > 0),
        placeholder: (__VLS_ctx.placeholder),
        'data-testid': (`${__VLS_ctx.testid}-input`),
    });
    if (open.value && results.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "results" },
            role: "listbox",
            'data-testid': (`${__VLS_ctx.testid}-results`),
        });
        /** @type {__VLS_StyleScopedClasses['results']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((results.value));
        for (const [user, index] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                ...{ onMousedown: (...[$event]) => {
                        void $event;
                        if (!(open.value && results.value.length > 0))
                            throw 0;
                        return (choose(user));
                        // @ts-ignore
                        [open, open, query, results, results, results, placeholder, testid, testid,];
                    } },
                key: (user.userId ?? user.settlementId ?? user.userName),
                role: "option",
                'aria-selected': (index === active.value),
                ...{ class: ({ active: index === active.value }) },
                'data-testid': (`${__VLS_ctx.testid}-pick-${user.userId ?? user.settlementId}`),
            });
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (user.userName);
            if (user.kind === 'anonymous') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge" },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                (__VLS_ctx.$t('adminApiKeys.lookup.noAccount'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "role" },
                });
                /** @type {__VLS_StyleScopedClasses['role']} */ ;
                (user.role);
            }
            if (user.kind === 'anonymous') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "via" },
                });
                /** @type {__VLS_StyleScopedClasses['via']} */ ;
                (__VLS_ctx.$t('adminApiKeys.lookup.settlementIn', { settlement: user.settlementName ?? '', world: user.worldName ?? '' }));
            }
            else if (user.via !== 'user') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "via" },
                });
                /** @type {__VLS_StyleScopedClasses['via']} */ ;
                (__VLS_ctx.$t(`adminApiKeys.lookup.via.${user.via}`, { name: user.matchedName ?? '' }));
                if (user.worldName) {
                    (user.worldName);
                }
            }
            else if (user.displayName) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "via" },
                });
                /** @type {__VLS_StyleScopedClasses['via']} */ ;
                (user.displayName);
            }
            // @ts-ignore
            [testid, active, active, $t, $t, $t,];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};

/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
const { t, d } = useI18n({ useScope: 'global' });
const conversations = ref([]);
const page = ref(1);
const pageSize = 20;
const loading = ref(true);
const loadError = ref(null);
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const result = await api.listConversations({ page: page.value, pageSize });
        conversations.value = result.items;
    }
    catch (err) {
        loadError.value = err instanceof ApiError ? err.message : t('messages.loadError');
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
function changePage(delta) {
    const next = page.value + delta;
    if (next < 1)
        return;
    page.value = next;
    void load();
}
function preview(body) {
    return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(conversations, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    /** @type {__VLS_StyleScopedClasses['conversation']} */ ;
    /** @type {__VLS_StyleScopedClasses['conversation']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "messages" },
    });
    /** @type {__VLS_StyleScopedClasses['messages']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "title-row" },
    });
    /** @type {__VLS_StyleScopedClasses['title-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('messages.title'));
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        to: "/settlement", ...{ class: "back" },
    }));
    const __VLS_2 = __VLS_1({
        to: "/settlement",
        ...{ class: "back" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    (__VLS_ctx.$t('messages.backToGame'));
    // @ts-ignore
    [$t, $t,];
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('common.states.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (conversations.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('messages.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "conversations" },
        });
        /** @type {__VLS_StyleScopedClasses['conversations']} */ ;
        const __VLS_6 = __VLS_tryAsConstant((conversations.value));
        for (const [conversation] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (conversation.otherUserId),
            });
            let __VLS_7;
            /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
            routerLink;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                ...{ class: "conversation" }, to: (`/messages/${conversation.otherUserId}`),
            }));
            const __VLS_9 = __VLS_8({
                ...{ class: "conversation" },
                to: (`/messages/${conversation.otherUserId}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
            /** @type {__VLS_StyleScopedClasses['conversation']} */ ;
            var __VLS_10;
            const { default: __VLS_12 } = __VLS_nonNull(__VLS_10.slots);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "who" },
            });
            /** @type {__VLS_StyleScopedClasses['who']} */ ;
            (conversation.otherDisplayName || conversation.otherUserName);
            if (conversation.unreadCount > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "unread" },
                });
                /** @type {__VLS_StyleScopedClasses['unread']} */ ;
                (conversation.unreadCount);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "preview" },
            });
            /** @type {__VLS_StyleScopedClasses['preview']} */ ;
            (preview(conversation.lastMessage.body));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "when" },
            });
            /** @type {__VLS_StyleScopedClasses['when']} */ ;
            (__VLS_unwrap(d, {})(new Date(conversation.lastMessage.sentAt), 'long'));
            // @ts-ignore
            [$t, $t, loading, loadError, loadError, conversations, conversations, d,];
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
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!!(conversations.value.length === 0))
                        throw 0;
                    return (changePage(-1));
                    // @ts-ignore
                    [];
                } },
            disabled: (__VLS_unwrap(page, {}) <= 1),
        });
        (__VLS_ctx.$t('messages.pager.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('messages.pager.page', { page: __VLS_unwrap(page, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!!(conversations.value.length === 0))
                        throw 0;
                    return (changePage(1));
                    // @ts-ignore
                    [$t, $t, page, page,];
                } },
            disabled: (conversations.value.length < __VLS_unwrap(pageSize, {})),
        });
        (__VLS_ctx.$t('messages.pager.next'));
    }
    // @ts-ignore
    [$t, conversations, pageSize,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

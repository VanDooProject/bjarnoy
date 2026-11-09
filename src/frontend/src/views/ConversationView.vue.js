/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { useUnsavedInput } from '../composables/useUnsavedInput';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { profileLocation } from '../lib/profileRoute';
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t, d } = useI18n({ useScope: 'global' });
const otherUserId = computed(() => route.params.userId);
const otherProfile = ref(null);
const messages = ref([]);
const loading = ref(true);
const loadError = ref(null);
// Opens the other player's profile as a modal over this conversation — see
// lib/profileRoute.ts's own comment.
const otherProfileLink = computed(() => otherProfile.value ? profileLocation(router, otherProfile.value.userName) : null);
// Oldest-first for display — the API returns newest-first for paging.
const orderedMessages = computed(() => [...messages.value].reverse());
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const [profile, page] = await Promise.all([
            api.getProfile(otherUserId.value),
            api.getConversation(otherUserId.value, { page: 1, pageSize: 50 }),
        ]);
        otherProfile.value = profile;
        messages.value = page.items;
        void api.markConversationRead(otherUserId.value);
    }
    catch (err) {
        loadError.value =
            err instanceof ApiError && err.status === 404
                ? t('messages.conversation.noSuchPlayer')
                : t('messages.conversation.loadError');
    }
    finally {
        loading.value = false;
    }
}
watch(otherUserId, load, { immediate: true });
// --- Sending ---
const draft = ref('');
const sending = ref(false);
const sendError = ref(null);
useUnsavedInput(() => draft.value.trim() !== '' || reportReason.value.trim() !== '');
const BODY_MAX = 2000;
async function send() {
    if (sending.value)
        return;
    const body = draft.value.trim();
    if (!body)
        return;
    sending.value = true;
    sendError.value = null;
    try {
        const message = await api.sendMessage({ recipientUserId: otherUserId.value, body });
        messages.value = [message, ...messages.value];
        draft.value = '';
    }
    catch (err) {
        sendError.value = err instanceof ApiError ? err.message : t('messages.conversation.sendError');
    }
    finally {
        sending.value = false;
    }
}
// --- Reporting ---
const reportingId = ref(null);
const reportReason = ref('');
const reportSending = ref(false);
const reportError = ref(null);
const reportedIds = ref(new Set());
function openReport(messageId) {
    reportingId.value = messageId;
    reportReason.value = '';
    reportError.value = null;
}
async function sendReport() {
    if (reportSending.value || !reportingId.value)
        return;
    if (!reportReason.value.trim()) {
        reportError.value = t('messages.conversation.reportDialog.reasonRequired');
        return;
    }
    reportSending.value = true;
    reportError.value = null;
    try {
        await api.reportMessage(reportingId.value, { reason: reportReason.value.trim() });
        reportedIds.value.add(reportingId.value);
        reportingId.value = null;
    }
    catch (err) {
        reportError.value = err instanceof ApiError ? err.message : t('messages.conversation.reportDialog.sendError');
    }
    finally {
        reportSending.value = false;
    }
}
function isMine(message) {
    return message.senderUserId === auth.user?.id;
}
function readStatus(message) {
    if (!isMine(message))
        return null;
    if (!message.readReceiptVisible)
        return null;
    return message.readAt
        ? t('messages.conversation.read', { date: d(new Date(message.readAt), 'long') })
        : t('messages.conversation.unread');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(otherProfile, {});
    __VLS_withDotValue(otherProfileLink, {});
    __VLS_withDotValue(reportedIds, {});
    __VLS_withDotValue(sending, {});
    __VLS_withDotValue(draft, {});
    __VLS_withDotValue(sendError, {});
    __VLS_withDotValue(reportingId, {});
    __VLS_withDotValue(reportError, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['bubble-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['bubble-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['mine']} */ ;
    /** @type {__VLS_StyleScopedClasses['bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['bubble-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['mine']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta']} */ ;
    /** @type {__VLS_StyleScopedClasses['composer']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "conversation-view" },
    });
    /** @type {__VLS_StyleScopedClasses['conversation-view']} */ ;
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
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
        routerLink;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            to: "/messages", ...{ class: "back" },
        }));
        const __VLS_2 = __VLS_1({
            to: "/messages",
            ...{ class: "back" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        /** @type {__VLS_StyleScopedClasses['back']} */ ;
        var __VLS_3;
        const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
        (__VLS_ctx.$t('messages.conversation.backToMessages'));
        // @ts-ignore
        [loading, $t, $t, loadError, loadError,];
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
            ...{ class: "head" },
        });
        /** @type {__VLS_StyleScopedClasses['head']} */ ;
        if (otherProfile.value && otherProfileLink.value) {
            let __VLS_6;
            /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
            routerLink;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                // @ts-ignore
                ...{ class: "who" }, to: (otherProfileLink.value),
            }));
            const __VLS_8 = __VLS_7({
                ...{ class: "who" },
                to: (otherProfileLink.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            /** @type {__VLS_StyleScopedClasses['who']} */ ;
            var __VLS_9;
            const { default: __VLS_11 } = __VLS_nonNull(__VLS_9.slots);
            (otherProfile.value.displayName || otherProfile.value.userName);
            // @ts-ignore
            [otherProfile, otherProfile, otherProfile, otherProfileLink, otherProfileLink,];
        }
        let __VLS_12;
        /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
        routerLink;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            to: "/messages", ...{ class: "back" },
        }));
        const __VLS_14 = __VLS_13({
            to: "/messages",
            ...{ class: "back" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        /** @type {__VLS_StyleScopedClasses['back']} */ ;
        var __VLS_15;
        const { default: __VLS_17 } = __VLS_nonNull(__VLS_15.slots);
        (__VLS_ctx.$t('messages.conversation.backToMessages'));
        // @ts-ignore
        [$t,];
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "thread" },
        });
        /** @type {__VLS_StyleScopedClasses['thread']} */ ;
        const __VLS_18 = __VLS_tryAsConstant((__VLS_unwrap(orderedMessages, {})));
        for (const [message] of __VLS_vFor(__VLS_nonNull(__VLS_18))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (message.id),
                ...{ class: (['bubble-row', { mine: isMine(message) }]) },
            });
            /** @type {__VLS_StyleScopedClasses['mine']} */ ;
            /** @type {__VLS_StyleScopedClasses['bubble-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bubble" },
            });
            /** @type {__VLS_StyleScopedClasses['bubble']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "body" },
            });
            /** @type {__VLS_StyleScopedClasses['body']} */ ;
            (message.body);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "meta" },
            });
            /** @type {__VLS_StyleScopedClasses['meta']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(d, {})(new Date(message.sentAt), 'long'));
            if (readStatus(message)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (readStatus(message));
            }
            if (!reportedIds.value.has(message.id)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(!reportedIds.value.has(message.id)))
                                throw 0;
                            return (openReport(message.id));
                            // @ts-ignore
                            [orderedMessages, d, reportedIds,];
                        } },
                    ...{ class: "report-link" },
                    type: "button",
                });
                /** @type {__VLS_StyleScopedClasses['report-link']} */ ;
                (__VLS_ctx.$t('messages.conversation.report'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "reported" },
                });
                /** @type {__VLS_StyleScopedClasses['reported']} */ ;
                (__VLS_ctx.$t('messages.conversation.reported'));
            }
            // @ts-ignore
            [$t, $t,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "composer" },
        });
        /** @type {__VLS_StyleScopedClasses['composer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
            ...{ onKeydown: (send) },
            value: (draft.value),
            rows: "2",
            maxlength: (__VLS_unwrap(BODY_MAX, {})),
            placeholder: (__VLS_ctx.$t('messages.conversation.composerPlaceholder')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (send) },
            disabled: (sending.value || !draft.value.trim()),
        });
        (__VLS_ctx.$t('messages.conversation.send'));
        if (sendError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (sendError.value);
        }
        if (reportingId.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(reportingId.value))
                            throw 0;
                        return (reportingId.value = null);
                        // @ts-ignore
                        [$t, $t, draft, draft, BODY_MAX, sending, sendError, sendError, reportingId, reportingId,];
                    } },
                ...{ class: "report-backdrop" },
            });
            /** @type {__VLS_StyleScopedClasses['report-backdrop']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "report-dialog" },
                role: "dialog",
                'aria-label': (__VLS_ctx.$t('messages.conversation.reportDialog.ariaLabel')),
            });
            /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('messages.conversation.reportDialog.title'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('messages.conversation.reportDialog.hint'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('messages.conversation.reportDialog.reason'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (sendReport) },
                value: (__VLS_unwrap(reportReason, {})),
                type: "text",
                maxlength: "500",
                placeholder: (__VLS_ctx.$t('messages.conversation.reportDialog.reasonPlaceholder')),
            });
            if (reportError.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (reportError.value);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (sendReport) },
                disabled: (__VLS_unwrap(reportSending, {})),
            });
            (__VLS_ctx.$t('messages.conversation.reportDialog.send'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(reportingId.value))
                            throw 0;
                        return (reportingId.value = null);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, reportingId, reportReason, reportError, reportError, reportSending,];
                    } },
                ...{ class: "secondary" },
                disabled: (__VLS_unwrap(reportSending, {})),
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('common.buttons.cancel'));
        }
    }
    // @ts-ignore
    [$t, reportSending,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

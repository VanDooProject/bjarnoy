/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The guest-army rows (owner, composition, "Send home") shared by
// TrainingQueuePanel.vue and QueueDrawer.vue — the host's view of who is
// stationed here. Each caller keeps its own section header.
import { useI18n } from 'vue-i18n';
import { useGuestRows } from '../../composables/useGuestRows';
const { t } = useI18n({ useScope: 'global' });
const { guests, sendingId, error, sendHome } = useGuestRows();
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(sendingId, {});
    __VLS_withDotValue(error, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['guest-send-home']} */ ;
    /** @type {__VLS_StyleScopedClasses['guest-send-home']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "guests-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['guests-grid']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(guests, {})));
    for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (g.key),
            ...{ class: "guest-row" },
        });
        /** @type {__VLS_StyleScopedClasses['guest-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "guest-info" },
        });
        /** @type {__VLS_StyleScopedClasses['guest-info']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "guest-owner" },
        });
        /** @type {__VLS_StyleScopedClasses['guest-owner']} */ ;
        (g.ownerName);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "guest-composition" },
        });
        /** @type {__VLS_StyleScopedClasses['guest-composition']} */ ;
        (g.composition);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (__VLS_unwrap(sendHome, {})(g.key));
                    // @ts-ignore
                    [guests, sendHome,];
                } },
            type: "button",
            ...{ class: "guest-send-home" },
            disabled: (sendingId.value === g.key),
        });
        /** @type {__VLS_StyleScopedClasses['guest-send-home']} */ ;
        (sendingId.value === g.key ? __VLS_unwrap(t, {})('hud.trainingQueue.sendingHome') : __VLS_unwrap(t, {})('hud.trainingQueue.sendHome'));
        // @ts-ignore
        [sendingId, sendingId, t, t,];
    }
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status-subtext error-note" },
        });
        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
        /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
        (error.value);
    }
    // @ts-ignore
    [error, error,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Small pill under the HUD bar while any background poll is failing (see
// stores/connectionStatus.ts). Polls keep retrying on their own, so this is
// information, not a blocking error: dismissing hides the current failure and
// it comes back if a further one arrives; it vanishes by itself once every
// poll succeeds again.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { describeLoadError } from '../../lib/loadError';
import { useConnectionStatusStore } from '../../stores/connectionStatus';
const status = useConnectionStatusStore();
const { t } = useI18n({ useScope: 'global' });
// Identifies "this failure": a new failure (any key) changes `failures` or
// `at`, which un-dismisses the banner.
const signature = computed(() => {
    const latest = status.latest;
    return latest ? `${latest.key}:${latest.failures}:${latest.at}` : null;
});
const dismissedSignature = ref(null);
const visible = computed(() => signature.value !== null && signature.value !== dismissedSignature.value);
// Healthy again: forget the dismissal so the next outage starts visible.
watch(signature, (value) => {
    if (value === null)
        dismissedSignature.value = null;
});
const summary = computed(() => (status.latest ? describeLoadError(status.latest.error).summary : ''));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(visible, {});
    __VLS_withDotValue(status, {});
    __VLS_withDotValue(dismissedSignature, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dismiss']} */ ;
    if (visible.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "connection-banner" },
            role: "status",
            'data-testid': "connection-banner",
        });
        /** @type {__VLS_StyleScopedClasses['connection-banner']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_unwrap(t, {})('hud.mapStatus.pollErrorTitle'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "summary" },
        });
        /** @type {__VLS_StyleScopedClasses['summary']} */ ;
        (__VLS_unwrap(summary, {}));
        if (status.value.latest && status.value.latest.failures > 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "count" },
            });
            /** @type {__VLS_StyleScopedClasses['count']} */ ;
            (status.value.latest.failures);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(visible.value))
                        throw 0;
                    return (dismissedSignature.value = __VLS_unwrap(signature, {}));
                    // @ts-ignore
                    [visible, t, summary, status, status, status, dismissedSignature, signature,];
                } },
            type: "button",
            ...{ class: "dismiss" },
            'aria-label': (__VLS_unwrap(t, {})('hud.mapStatus.dismiss')),
            title: (__VLS_unwrap(t, {})('hud.mapStatus.dismiss')),
        });
        /** @type {__VLS_StyleScopedClasses['dismiss']} */ ;
    }
    // @ts-ignore
    [t, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

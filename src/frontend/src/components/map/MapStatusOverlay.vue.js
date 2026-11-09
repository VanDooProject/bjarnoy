/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// What the map is waiting on (or why it can't continue), drawn over the pale
// fog backdrop. Without it a slow or failed load looks identical: an empty
// fogged map forever. `step` is an already-translated label of the current
// loading phase; `error` is whatever the failed load threw — the technical
// part (which call, which status) comes from describeLoadError and is not
// translated, only the title and retry button are.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { describeLoadError } from "../../lib/loadError";
import { prefersReducedMotion } from "../../lib/motion";
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: "global" });
// Same one-shot read as MapLoadingIndicator — a fixed device preference.
const reducedMotion = prefersReducedMotion();
const hasError = computed(() => props.error !== null && props.error !== undefined);
const state = computed(() => hasError.value ? "error" : props.step ? "loading" : null);
const described = computed(() => hasError.value ? describeLoadError(props.error) : null);
// The summary already includes the detail for plain Errors; skip a duplicate line.
const detail = computed(() => described.value?.detail && described.value.detail !== described.value.summary
    ? described.value.detail
    : null);
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
    __VLS_withDotValue(state, {});
    __VLS_withDotValue(described, {});
    __VLS_withDotValue(detail, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['retry']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex']} */ ;
    if (state.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "map-status" },
            ...{ class: ({ 'map-status--reduced': __VLS_unwrap(reducedMotion, {}) }) },
            'data-testid': "map-status-overlay",
            'data-state': (state.value),
        });
        /** @type {__VLS_StyleScopedClasses['map-status']} */ ;
        /** @type {__VLS_StyleScopedClasses['map-status--reduced']} */ ;
        if (state.value === 'loading') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "loading" },
                role: "status",
                'aria-live': "polite",
            });
            /** @type {__VLS_StyleScopedClasses['loading']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                ...{ class: "hex" },
                viewBox: "0 0 100 100",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['hex']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                points: "50,4 93,27 93,73 50,96 7,73 7,27",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "label" },
            });
            /** @type {__VLS_StyleScopedClasses['label']} */ ;
            (__VLS_ctx.step);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "card" },
                role: "alert",
            });
            /** @type {__VLS_StyleScopedClasses['card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
                ...{ class: "title" },
            });
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            (__VLS_ctx.errorTitle ?? __VLS_unwrap(t, {})("hud.mapStatus.errorTitle"));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "summary" },
            });
            /** @type {__VLS_StyleScopedClasses['summary']} */ ;
            (described.value.summary);
            if (detail.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "detail" },
                });
                /** @type {__VLS_StyleScopedClasses['detail']} */ ;
                (detail.value);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value))
                            throw 0;
                        if (!!(state.value === 'loading'))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('retry'));
                        // @ts-ignore
                        [state, state, state, reducedMotion, step, errorTitle, t, described, detail, detail, emit,];
                    } },
                type: "button",
                ...{ class: "retry" },
            });
            /** @type {__VLS_StyleScopedClasses['retry']} */ ;
            (__VLS_unwrap(t, {})("hud.mapStatus.retry"));
        }
    }
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

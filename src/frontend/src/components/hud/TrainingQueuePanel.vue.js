/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 1: a Travian-style "who's standing at home" view — the
// training-queue half mirrors BuildQueuePanel.vue's countdown/progress-bar
// convention (same backend-driven-timer reasoning: the queue's own
// completesInSeconds is real, not simulated), and the garrison half is a
// simple unit-type + count list underneath it. Kept as a sibling panel
// rather than folding into BuildQueuePanel — build and train are
// conceptually separate queues with different slot limits (Settlement.cs's
// MaxQueueLength vs. MaxTrainingQueueLength) and it reads awkwardly to
// interleave building levels with unit counts in one list.
//
// Demo mode has no backend training queue or garrison (the local WorldModel
// has no concept of trained units yet), so both halves render only when
// there is something to show — same as BuildQueuePanel not rendering when
// `world.hud.queue` is empty.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { unitName } from '../../i18n/catalogueNames';
import GuestList from './GuestList.vue';
import { useWorldStore } from '../../stores/world';
import { useTrainingOrders } from '../../composables/useQueueOrders';
const world = useWorldStore();
const { t } = useI18n({ useScope: 'global' });
const orders = useTrainingOrders();
const garrison = computed(() => world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })));
// Issue #40 phase 4: guest (Support) armies stationed at this settlement —
// the host's view (`GET /settlements/{id}/guests`, fetched alongside
// `world.armies` — see world.ts's `refreshArmies`), with a "Send home" per
// row (GuestList.vue, shared with QueueDrawer). Shown as a small section
// under Garrison rather than a separate HUD panel: most screen corners are
// already taken (BuildQueuePanel top-left, this panel top-right, ArmyPanel
// bottom-right), and a guest garrison is close kin to "who's standing at
// home" shown just above it.
const guestCount = computed(() => world.guestArmies.length);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(orders, {});
    __VLS_withDotValue(garrison, {});
    __VLS_withDotValue(guestCount, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-progress-fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['has-orders-above']} */ ;
    if (orders.value.length || garrison.value.length || guestCount.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card training-queue-panel" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['training-queue-panel']} */ ;
        if (orders.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-card-header" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-title" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.title'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-count" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.orders', { count: orders.value.length }));
            const __VLS_0 = __VLS_tryAsConstant((orders.value));
            for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (o.key),
                    ...{ class: "status-row" },
                    ...{ class: ({ 'is-waiting': o.waiting }) },
                });
                /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-row-top" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-top']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-name" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-name']} */ ;
                (o.name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-time" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
                (o.remaining);
                if (!o.waiting) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "status-progress" },
                    });
                    /** @type {__VLS_StyleScopedClasses['status-progress']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                        ...{ class: "status-progress-fill" },
                        ...{ class: ({ 'is-done': o.done }) },
                        ...{ style: ({ width: `${Math.round(o.progress * 100)}%` }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['status-progress-fill']} */ ;
                    /** @type {__VLS_StyleScopedClasses['is-done']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-subtext" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                (o.building);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-subtext" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                (o.subtext);
                // @ts-ignore
                [orders, orders, orders, orders, garrison, guestCount, t, t,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "garrison" },
            ...{ class: ({ 'has-orders-above': orders.value.length }) },
        });
        /** @type {__VLS_StyleScopedClasses['garrison']} */ ;
        /** @type {__VLS_StyleScopedClasses['has-orders-above']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "status-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingQueue.garrison'));
        if (garrison.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "garrison-grid" },
            });
            /** @type {__VLS_StyleScopedClasses['garrison-grid']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((garrison.value));
            for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (g.key),
                    ...{ class: "garrison-row" },
                });
                /** @type {__VLS_StyleScopedClasses['garrison-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "garrison-name" },
                });
                /** @type {__VLS_StyleScopedClasses['garrison-name']} */ ;
                (g.label);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "garrison-count" },
                });
                /** @type {__VLS_StyleScopedClasses['garrison-count']} */ ;
                (g.count);
                // @ts-ignore
                [orders, garrison, garrison, t,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext garrison-empty" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['garrison-empty']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.garrisonEmpty'));
        }
        if (guestCount.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "guests has-orders-above" },
            });
            /** @type {__VLS_StyleScopedClasses['guests']} */ ;
            /** @type {__VLS_StyleScopedClasses['has-orders-above']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-card-header" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-title" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.guests'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-count" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
            (guestCount.value);
            const __VLS_2 = GuestList;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
            // @ts-ignore
            }));
            const __VLS_4 = __VLS_3({}, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
    }
    // @ts-ignore
    [guestCount, guestCount, t, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};

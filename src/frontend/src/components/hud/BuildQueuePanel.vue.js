/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// zip 9 / README "real-time elements": build queue countdowns, drawn from
// the backend's real per-order timers (Bjarnoy.Domain.Buildings.BuildOrder)
// rather than simulated — see stores/world.ts's `hud.queue`. Demo mode has
// no backend queue (buildings there place instantly), so this panel simply
// doesn't render then.
//
// Issue #16 "status box, left side": restyled to the "CONSTRUCTION" card
// the user described (a header row with a used/total slot count, sharp
// corners, per-row title + right-aligned countdown, a thin progress bar
// that reads orange while in progress and blue once essentially done, and
// a dim subtext line with the hex + a short note) — see the `.status-card`
// rules below, written generically enough that a raid or settler-voyage
// card (this issue's other two status-box examples; their *content* is
// illustrative, not built here) could reuse the same classes with a
// different accent color, without wiring their data yet.
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useBuildOrders } from '../../composables/useQueueOrders';
import { confirmedBuild, coordKey, heldBuildRows, releaseBuildRow } from '../../composables/buildFeedback';
import { motionEnabled } from '../../lib/motion';
import { bumpCount, flyToken, slideInCard, slideInRow } from '../../lib/hud/queueMotion';
const { defineEmits, } = {};
const world = useWorldStore();
const { t } = useI18n({ useScope: 'global' });
const emit = defineEmits();
const cancelling = ref(null);
const error = ref('');
async function cancel(orderId) {
    error.value = '';
    cancelling.value = orderId;
    try {
        await world.cancelBuildLive(orderId);
    }
    catch (err) {
        error.value = err instanceof Error ? err.message : t('hud.buildQueue.cancelError');
    }
    finally {
        cancelling.value = null;
    }
}
const orders = useBuildOrders();
// Q1 + Q5: after a confirmed build a gold token flies from the hex's dial into
// the new row, which then slides in while the slot count bumps; if the card
// was hidden (no orders yet) it first slides in from the left. Until then the
// new row (and, when it is the only one, the whole card) is held back —
// MapView holds it when the optimistic build starts, because the real order
// arrives with the refresh a moment before the confirmation is announced.
const cardEl = ref(null);
/** The card was told to show itself (the confirmation is playing) although every row is still held. */
const revealed = ref(false);
const isHeld = (coord) => heldBuildRows.value.includes(coordKey(coord));
const cardHeld = computed(() => orders.value.length > 0 && !revealed.value && orders.value.every((o) => isHeld(o.coord)));
watch(confirmedBuild, async (event) => {
    if (!event)
        return;
    // Reduced motion (or no animation support): no flight, the row and count just appear.
    if (!motionEnabled()) {
        releaseBuildRow(event.coord);
        return;
    }
    const cardWasHidden = cardHeld.value;
    revealed.value = true;
    await nextTick();
    const card = cardEl.value;
    const row = card?.querySelector(`[data-coord="${coordKey(event.coord)}"]`);
    if (!card || !row) {
        releaseBuildRow(event.coord);
        revealed.value = false;
        return;
    }
    if (cardWasHidden)
        await slideInCard(card);
    if (event.from) {
        const rect = row.getBoundingClientRect();
        await flyToken(event.from, { x: rect.left + 20, y: rect.top + 12 });
    }
    releaseBuildRow(event.coord);
    await nextTick();
    void slideInRow(row);
    const count = card.querySelector('.status-card-count');
    if (count)
        void bumpCount(count);
    if (heldBuildRows.value.length === 0)
        revealed.value = false;
});
// Issue #158: a footer note when any queued order is a waiting one — its
// cost sits reserved (still in `hud.resources`, still counted against the
// storage cap) but unspendable elsewhere. Reads `hud.reserved` — the sum of
// every waiting order's cost — rather than re-deriving it locally.
const reservedTotal = computed(() => {
    const r = world.hud.reserved;
    return r.wood + r.stone + r.food + r.iron;
});
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
    __VLS_withDotValue(orders, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(cancelling, {});
    __VLS_withDotValue(error, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-held']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-progress-fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
    if (orders.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "cardEl",
            ...{ class: "status-card" },
            ...{ class: ({ 'is-held': __VLS_unwrap(cardHeld, {}) }) },
        });
        /** @type {__VLS_StyleScopedClasses['status-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-held']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "status-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
        (__VLS_unwrap(t, {})('hud.buildQueue.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "status-card-count" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
        (__VLS_unwrap(t, {})('hud.buildQueue.slots', { used: world.value.hud.construction.slotsUsed, total: world.value.hud.construction.slots }));
        const __VLS_0 = __VLS_tryAsConstant((orders.value));
        for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (o.key),
                ...{ class: "status-row" },
                ...{ class: ({ 'is-waiting': o.waiting, 'is-held': __VLS_unwrap(isHeld, {})(o.coord) }) },
                'data-coord': (__VLS_unwrap(coordKey, {})(o.coord)),
            });
            /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-held']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(orders.value.length))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('select', o.coord));
                        // @ts-ignore
                        [orders, orders, cardHeld, t, t, world, world, isHeld, coordKey, emit,];
                    } },
                type: "button",
                ...{ class: "status-row-click" },
            });
            /** @type {__VLS_StyleScopedClasses['status-row-click']} */ ;
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
            (o.subtext);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(orders.value.length))
                            throw 0;
                        return (cancel(o.key));
                        // @ts-ignore
                        [];
                    } },
                type: "button",
                ...{ class: "cancel-button" },
                disabled: (cancelling.value === o.key),
            });
            /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
            (__VLS_unwrap(t, {})('hud.buildQueue.cancel'));
            // @ts-ignore
            [t, cancelling,];
        }
        if (__VLS_unwrap(reservedTotal, {}) > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext reserved-footer" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['reserved-footer']} */ ;
            (__VLS_unwrap(t, {})('hud.buildQueue.reservedFooter', {
                wood: Math.round(world.value.hud.reserved.wood),
                stone: Math.round(world.value.hud.reserved.stone),
                food: Math.round(world.value.hud.reserved.food),
                iron: Math.round(world.value.hud.reserved.iron),
            }));
        }
        if (error.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext error" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (error.value);
        }
    }
    // @ts-ignore
    [t, world, world, world, world, reservedTotal, error, error,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};

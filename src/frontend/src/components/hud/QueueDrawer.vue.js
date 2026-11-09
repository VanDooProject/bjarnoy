/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Mobile counterpart to BuildQueuePanel.vue + TrainingQueuePanel.vue: on a
// narrow viewport there isn't room for two 240px status cards, so both
// queues (plus the garrison/guests) live in one slide-out drawer instead.
//
// The collapsed handle deliberately does NOT show a slot count the way the
// desktop panels do — with more than a handful of slots (premium accounts
// can queue well past 3), a static "N / M" count stops being useful at a
// glance. Instead it's a small 48px-wide edge tab showing, per non-empty
// category (build then training), an icon, the soonest order's remaining time, and a thin progress
// bar for that soonest order — see soonest()/buildHandleRow/
// trainingHandleRow below.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { unitName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import GuestList from './GuestList.vue';
import { hudRailHeightPx } from '../../composables/hudBarHeight';
import { formatCountdownShort, useBuildOrders, useTrainingOrders, } from '../../composables/useQueueOrders';
import { sortArmyRowsByEta, useArmyRows } from '../../composables/useArmyRows';
import { confirmedBuild } from '../../composables/buildFeedback';
import { motionEnabled } from '../../lib/motion';
import { peek, pulseHandle, slideDrawer } from '../../lib/hud/queueMotion';
import axeIconUrl from '../../assets/icons/axe.svg?url';
import swordIconUrl from '../../assets/icons/sword.svg?url';
import flagIconUrl from '../../assets/icons/flag.svg?url';
import { isDoubleTap } from '../../lib/map/doubleTap';
const { defineEmits, defineModel, } = {};
const world = useWorldStore();
const { t } = useI18n({ useScope: 'global' });
const open = defineModel('open', { default: false });
const emit = defineEmits();
const buildOrders = useBuildOrders();
const trainingOrders = useTrainingOrders();
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
function soonest(pool) {
    if (!pool.length)
        return null;
    return pool.reduce((best, r) => ((r.remainingSeconds ?? Infinity) < (best.remainingSeconds ?? Infinity) ? r : best));
}
// Build's soonest row is the soonest *non-waiting* order (a waiting order
// has no completion instant yet — see useQueueOrders.ts's own remarks).
// When every build order is waiting, the row still shows (so the handle
// reflects that something is queued) but with a muted "—" and no progress
// bar rather than picking an arbitrary waiting order to imply progress that
// doesn't exist.
const buildHandleRow = computed(() => {
    if (!buildOrders.value.length)
        return null;
    const active = buildOrders.value.filter((o) => !o.waiting);
    const order = soonest(active);
    return {
        category: 'build',
        icon: axeIconUrl,
        timeText: order ? formatCountdownShort(order.remainingSeconds ?? 0) : '—',
        progress: order?.progress ?? 0,
        done: order?.done ?? false,
        showProgress: order !== null,
    };
});
const trainingHandleRow = computed(() => {
    if (!trainingOrders.value.length)
        return null;
    const order = soonest(trainingOrders.value);
    return {
        category: 'train',
        icon: swordIconUrl,
        timeText: order?.remainingSeconds != null ? formatCountdownShort(order.remainingSeconds) : '—',
        progress: order?.progress ?? 0,
        done: order?.done ?? false,
        showProgress: order?.remainingSeconds != null,
    };
});
// Armies away from home: the soonest arrival (outbound or returning) across
// them. Only supporting armies (no active leg) → muted "—", like a build
// queue that's all waiting.
const armyHandleRow = computed(() => {
    if (!sortedArmyRows.value.length)
        return null;
    void world.hud.tick; // tick the countdown every second
    const next = sortedArmyRows.value[0].etaMs !== null ? sortedArmyRows.value[0] : null;
    return {
        category: 'army',
        icon: flagIconUrl,
        timeText: next ? formatCountdownShort((next.etaMs - Date.now()) / 1000) : '—',
        progress: next?.progress ?? 0,
        done: false,
        showProgress: next !== null,
    };
});
const handleRows = computed(() => [buildHandleRow.value, trainingHandleRow.value, armyHandleRow.value].filter((r) => r !== null));
const garrison = computed(() => world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })));
// Issue #40 phase 4 — the guest rows themselves (and their "Send home") are
// GuestList.vue, shared with TrainingQueuePanel.vue; see its comment for why
// guests are folded in here rather than getting a separate HUD element.
const guestCount = computed(() => world.guestArmies.length);
const reservedTotal = computed(() => {
    const r = world.hud.reserved;
    return r.wood + r.stone + r.food + r.iron;
});
// Issue: mobile army dispatch — armies dispatched from this settlement,
// listed between Training and Garrison (see the drawer template below).
// Sorted soonest-ETA-first the same way as the queues above it; a
// supporting army (no active ETA) sorts last.
const armyRows = useArmyRows();
const sortedArmyRows = computed(() => sortArmyRowsByEta(armyRows.value));
const recallingId = ref(null);
async function recall(armyId) {
    recallingId.value = armyId;
    try {
        await world.recallArmyLive(armyId);
    }
    finally {
        recallingId.value = null;
    }
}
function beginFieldOrder(armyId) {
    close();
    world.startFieldOrder(armyId);
}
// A single tap toggles the army's selection (route on the map) and leaves
// the drawer open; a double tap (the shared isDoubleTap rule, same as the
// map's double-tap zoom) closes it and has the map focus the army.
let lastArmyTap = null;
function selectArmy(armyId, event) {
    const tap = { at: { x: event.clientX, y: event.clientY }, timeMs: event.timeStamp };
    if (lastArmyTap && lastArmyTap.armyId === armyId && isDoubleTap(lastArmyTap.tap, tap)) {
        lastArmyTap = null;
        close();
        emit('select-army', armyId);
        return;
    }
    lastArmyTap = { armyId, tap };
    if (world.selectedArmyId === armyId) {
        world.clearSelectedArmy();
    }
    else {
        world.selectArmy(armyId);
    }
}
const hasAnything = computed(() => buildOrders.value.length > 0
    || trainingOrders.value.length > 0
    || garrison.value.length > 0
    || guestCount.value > 0
    || armyRows.value.length > 0);
// The whole drawer (v-if="hasAnything" on the template root) unmounts the
// instant the last queue/garrison/guest entry disappears — if that happens
// while `open` is still true, the parent's v-model stays stuck at true with
// no drawer left to close it, and MapView's canvasInteractionLocked watch
// (keyed off this same `open`) never flips back, permanently locking map
// interaction. Force-close before that can happen, and on unmount as a
// backstop for any other path that drops the drawer while open.
watch(hasAnything, (has) => {
    if (!has)
        open.value = false;
});
function toggle() {
    open.value = !open.value;
}
function close() {
    open.value = false;
}
// Drag-to-open/close (issue: mobile queue sidebar). Matches the CSS's own
// dimensions — see the `.queue-drawer`/`.queue-drawer-handle` rules below —
// so the drag transform lines up with the resting transform exactly.
const HANDLE_W = 48;
// A plain computed() here would cache window.innerWidth from whenever it
// was first read and never update — a rotation/resize would then desync
// the drag clamp/threshold math from the CSS transform, which recomputes
// `min(86vw, 340px)` live. Track the live width instead.
const viewportWidth = ref(window.innerWidth);
function onWindowResize() {
    viewportWidth.value = window.innerWidth;
}
const OPEN_W = computed(() => Math.min(viewportWidth.value * 0.86, 340));
const TRAVEL = computed(() => OPEN_W.value - HANDLE_W);
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
// null when not dragging (the CSS class-driven transform + transition
// takes over); a clamped in-progress offset while a pointer is down.
const dragPx = ref(null);
let dragState = null;
// Set when a pointer gesture on the handle ended as a drag (or a vertical
// scroll), so the click the browser may still fire for it doesn't toggle.
let handleGestureWasDrag = false;
const rootStyle = computed(() => {
    // Landscape rail (TopBar.vue): the HUD's ☰ button and resource bubbles fill
    // the top-left, where this drawer's handle also sits — start the whole
    // column below them (0 outside rail mode, which leaves the CSS `top` alone).
    const railClear = hudRailHeightPx.value > 0 ? { top: `${hudRailHeightPx.value + 16}px` } : {};
    if (dragPx.value === null)
        return railClear;
    const base = open.value ? 0 : -TRAVEL.value;
    return { ...railClear, transform: `translateX(${base + dragPx.value}px)` };
});
function onHandlePointerDown(event) {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handleGestureWasDrag = false;
    dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startT: performance.now(),
        openAtStart: open.value,
        decided: null,
    };
    dragPx.value = 0;
}
function onHandlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId)
        return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (dragState.decided === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8)
            return;
        // A drag that starts more vertical than horizontal is a scroll, not a
        // drawer drag — bail out entirely rather than fighting the gesture.
        dragState.decided = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
        if (dragState.decided === 'vertical') {
            dragPx.value = null;
            return;
        }
    }
    if (dragState.decided !== 'horizontal')
        return;
    dragPx.value = dragState.openAtStart ? clamp(dx, -TRAVEL.value, 0) : clamp(dx, 0, TRAVEL.value);
}
function settleDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId)
        return;
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId))
        handle.releasePointerCapture(event.pointerId);
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const dt = performance.now() - dragState.startT;
    const { openAtStart, decided } = dragState;
    dragState = null;
    dragPx.value = null;
    // A tap is toggled by the click that follows it (onHandleClick), not here:
    // opening on pointerup slides the panel in under the finger before that
    // click fires, so a touch click then lands on a drawer row (selecting it
    // and closing the drawer again) instead of on the handle.
    const isTap = decided === null && Math.abs(dx) < 8 && Math.abs(dy) < 8;
    if (isTap)
        return;
    handleGestureWasDrag = true;
    if (decided === 'vertical')
        return;
    const travel = TRAVEL.value;
    const velocity = dt > 0 ? dx / dt : 0;
    if (!openAtStart) {
        const traveledFraction = clamp(dx, 0, travel) / travel;
        open.value = traveledFraction > 0.4 || velocity > 0.5;
    }
    else {
        const traveledFraction = clamp(-dx, 0, travel) / travel;
        open.value = !(traveledFraction > 0.4 || -velocity > 0.5);
    }
}
function onHandlePointerCancel(event) {
    if (!dragState || event.pointerId !== dragState.pointerId)
        return;
    dragState = null;
    dragPx.value = null;
}
// Taps (touch or mouse) and keyboard activation (Enter/Space, `detail === 0`)
// all toggle here. The click a browser fires after a drag is skipped — the
// drag's own pointerup already settled the drawer.
function onHandleClick(event) {
    if (event.detail !== 0 && handleGestureWasDrag)
        return;
    toggle();
}
// P2 + P4: after a confirmed build, with the drawer collapsed, a peek panel
// slides out from behind the handle with the new order ("Farm → 1",
// "3:00 · queued"), stays 1.5 s and slides back. Only once it has retracted
// does the handle give one gold pulse. The
// drawer itself stays closed; with it open (or under reduced motion) nothing
// plays — the handle's own times still update.
const handleEl = ref(null);
const peekEl = ref(null);
const peekOrder = ref(null);
watch(confirmedBuild, async (event) => {
    if (!event || open.value || !motionEnabled() || peekOrder.value)
        return;
    peekOrder.value = { name: event.name, level: event.level, time: event.time };
    await nextTick();
    if (peekEl.value)
        await peek(peekEl.value);
    peekOrder.value = null;
    await nextTick();
    if (open.value || !handleEl.value)
        return;
    void pulseHandle(handleEl.value);
});
function selectBuildOrder(coord) {
    close();
    emit('select', coord);
}
function onKeydown(event) {
    if (event.key === 'Escape' && open.value) {
        close();
    }
}
onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onWindowResize);
});
onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onWindowResize);
    // Backstop for hasAnything's own watch above: whatever unmounts this
    // drawer while open (e.g. useIsMobile crossing back over the breakpoint
    // mid-gesture) must not leave the parent's v-model — and therefore the
    // canvas interaction lock keyed off it — stuck at true.
    open.value = false;
});
// The column slides out to its docked edge when the last order finishes (and
// back in when the queue refills) instead of vanishing; the force-close watch
// above has already closed it, so nothing can be left open behind the exit.
function onDrawerEnter(el, done) {
    const drawer = el.querySelector('.queue-drawer');
    if (!drawer)
        return done();
    void slideDrawer(drawer, 'in').then(done, done);
}
function onDrawerLeave(el, done) {
    const drawer = el.querySelector('.queue-drawer');
    if (!drawer)
        return done();
    void slideDrawer(drawer, 'out').then(done, done);
}
const __VLS_defaultModels = {
    'open': false,
};
void __VLS_defaultModels;
let __VLS_modelEmit;
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
    __VLS_withDotValue(hasAnything, {});
    __VLS_withDotValue(open, {});
    __VLS_withDotValue(dragPx, {});
    __VLS_withDotValue(buildOrders, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(cancelling, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(trainingOrders, {});
    __VLS_withDotValue(sortedArmyRows, {});
    __VLS_withDotValue(recallingId, {});
    __VLS_withDotValue(garrison, {});
    __VLS_withDotValue(guestCount, {});
    __VLS_withDotValue(peekOrder, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-progress-fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['army-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer-close']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-time']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-progress-fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue-drawer-chevron']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-open']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onEnter': {} }, ...{ 'onLeave': {} }, css: (false),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onEnter': {} },
        ...{ 'onLeave': {} },
        css: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.enter} */
        onEnter: (onDrawerEnter),
    };
    void __VLS_6;
    const __VLS_7 = {
        /** @type {typeof __VLS_5.leave} */
        onLeave: (onDrawerLeave),
    };
    void __VLS_7;
    var __VLS_3;
    var __VLS_4;
    const { default: __VLS_8 } = __VLS_nonNull(__VLS_3.slots);
    if (hasAnything.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        if (open.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ onPointerdown: (close) },
                ...{ class: "queue-drawer-backdrop" },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-backdrop']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "queue-drawer" },
            ...{ class: ({ 'is-open': open.value, 'is-dragging': dragPx.value !== null }) },
            ...{ style: (__VLS_unwrap(rootStyle, {})) },
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-open']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-dragging']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            id: "queue-drawer-body",
            ...{ class: "queue-drawer-panel" },
            'aria-hidden': (!open.value),
            inert: (!open.value),
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "queue-drawer-header" },
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "status-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
        (__VLS_unwrap(t, {})('hud.queueDrawer.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (close) },
            type: "button",
            ...{ class: "queue-drawer-close" },
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-close']} */ ;
        (__VLS_unwrap(t, {})('hud.queueDrawer.close'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "queue-drawer-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-scroll']} */ ;
        if (buildOrders.value.length) {
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
            const __VLS_9 = __VLS_tryAsConstant((buildOrders.value));
            for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (o.key),
                    ...{ class: "status-row" },
                    ...{ class: ({ 'is-waiting': o.waiting }) },
                });
                /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(hasAnything.value))
                                throw 0;
                            if (!(buildOrders.value.length))
                                throw 0;
                            return (selectBuildOrder(o.coord));
                            // @ts-ignore
                            [hasAnything, open, open, open, open, dragPx, rootStyle, t, t, t, t, buildOrders, buildOrders, world, world,];
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
                            if (!(hasAnything.value))
                                throw 0;
                            if (!(buildOrders.value.length))
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
        }
        if (error.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext error" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (error.value);
        }
        if (trainingOrders.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-card-header" },
                ...{ class: ({ 'has-section-above': buildOrders.value.length }) },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
            /** @type {__VLS_StyleScopedClasses['has-section-above']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-title" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.title'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-count" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.orders', { count: trainingOrders.value.length }));
            const __VLS_10 = __VLS_tryAsConstant((trainingOrders.value));
            for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
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
                [t, t, t, buildOrders, world, world, world, world, reservedTotal, error, error, trainingOrders, trainingOrders, trainingOrders,];
            }
        }
        if (sortedArmyRows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-card-header" },
                ...{ class: ({ 'has-section-above': buildOrders.value.length || trainingOrders.value.length }) },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
            /** @type {__VLS_StyleScopedClasses['has-section-above']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-title" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
            (__VLS_unwrap(t, {})('hud.queueDrawer.armies'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-count" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
            (sortedArmyRows.value.length);
            const __VLS_11 = __VLS_tryAsConstant((sortedArmyRows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (row.id),
                    ...{ class: "status-row army-row" },
                    ...{ class: ({ 'is-selected': row.selected }) },
                });
                /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['army-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(hasAnything.value))
                                throw 0;
                            if (!(sortedArmyRows.value.length))
                                throw 0;
                            return (selectArmy(row.id, $event));
                            // @ts-ignore
                            [t, buildOrders, trainingOrders, sortedArmyRows, sortedArmyRows, sortedArmyRows,];
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
                (row.composition);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-time" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
                (row.eta ?? '—');
                if (row.progress !== null) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "status-progress" },
                    });
                    /** @type {__VLS_StyleScopedClasses['status-progress']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                        ...{ class: "status-progress-fill" },
                        ...{ style: ({ width: `${Math.round(row.progress * 100)}%` }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['status-progress-fill']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-subtext" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                (row.status);
                if (row.mission) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "mission-tag" },
                    });
                    /** @type {__VLS_StyleScopedClasses['mission-tag']} */ ;
                    (row.mission);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "army-row-actions" },
                });
                /** @type {__VLS_StyleScopedClasses['army-row-actions']} */ ;
                if (row.canFieldOrder) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(hasAnything.value))
                                    throw 0;
                                if (!(sortedArmyRows.value.length))
                                    throw 0;
                                if (!(row.canFieldOrder))
                                    throw 0;
                                return (beginFieldOrder(row.id));
                                // @ts-ignore
                                [];
                            } },
                        type: "button",
                        ...{ class: "cancel-button" },
                        disabled: (row.fieldOrderLocked),
                    });
                    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
                    (row.fieldOrderLabel);
                }
                if (row.canRecall) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(hasAnything.value))
                                    throw 0;
                                if (!(sortedArmyRows.value.length))
                                    throw 0;
                                if (!(row.canRecall))
                                    throw 0;
                                return (recall(row.id));
                                // @ts-ignore
                                [];
                            } },
                        type: "button",
                        ...{ class: "cancel-button recall" },
                        disabled: (recallingId.value === row.id),
                    });
                    /** @type {__VLS_StyleScopedClasses['cancel-button']} */ ;
                    /** @type {__VLS_StyleScopedClasses['recall']} */ ;
                    (recallingId.value === row.id ? __VLS_unwrap(t, {})('hud.armyPanel.recalling') : __VLS_unwrap(t, {})('hud.armyPanel.recall'));
                }
                // @ts-ignore
                [t, t, recallingId, recallingId,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card-header" },
            ...{ class: ({ 'has-section-above': buildOrders.value.length || trainingOrders.value.length || sortedArmyRows.value.length }) },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
        /** @type {__VLS_StyleScopedClasses['has-section-above']} */ ;
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
            const __VLS_12 = __VLS_tryAsConstant((garrison.value));
            for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
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
                [t, buildOrders, trainingOrders, sortedArmyRows, garrison, garrison,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingQueue.garrisonEmpty'));
        }
        if (guestCount.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-card-header has-section-above" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
            /** @type {__VLS_StyleScopedClasses['has-section-above']} */ ;
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
            const __VLS_13 = GuestList;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
            // @ts-ignore
            }));
            const __VLS_15 = __VLS_14({}, ...__VLS_functionalComponentArgsRest(__VLS_14));
        }
        if (peekOrder.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "peekEl",
                ...{ class: "queue-drawer-peek" },
                role: "status",
                'data-testid': "queue-peek",
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-peek']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({
                ...{ class: "queue-drawer-peek-title" },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-peek-title']} */ ;
            (__VLS_unwrap(t, {})('hud.buildQueue.orderName', { name: peekOrder.value.name, level: peekOrder.value.level }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "queue-drawer-peek-sub" },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-peek-sub']} */ ;
            (peekOrder.value.time ? __VLS_unwrap(t, {})('hud.queueDrawer.peekQueued', { time: peekOrder.value.time }) : __VLS_unwrap(t, {})('hud.queueDrawer.peekQueuedNoTime'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onPointerdown: (onHandlePointerDown) },
            ...{ onPointermove: (onHandlePointerMove) },
            ...{ onPointerup: (settleDrag) },
            ...{ onPointercancel: (onHandlePointerCancel) },
            ...{ onClick: (onHandleClick) },
            ref: "handleEl",
            type: "button",
            ...{ class: "queue-drawer-handle" },
            'aria-expanded': (open.value),
            'aria-controls': "queue-drawer-body",
            'aria-label': (open.value ? __VLS_unwrap(t, {})('hud.queueDrawer.closeLabel') : __VLS_unwrap(t, {})('hud.queueDrawer.openLabel')),
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-handle']} */ ;
        const __VLS_18 = __VLS_tryAsConstant((__VLS_unwrap(handleRows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_18))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.category),
                ...{ class: "queue-drawer-handle-row" },
                ...{ class: (`is-${row.category}`) },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "queue-drawer-handle-icon-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-icon-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (row.icon),
                alt: "",
                'aria-hidden': "true",
                ...{ class: "queue-drawer-handle-icon" },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "queue-drawer-handle-time" },
                ...{ class: ({ 'is-muted': !row.showProgress }) },
            });
            /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-time']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-muted']} */ ;
            (row.timeText);
            if (row.showProgress) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "queue-drawer-handle-progress" },
                });
                /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-progress']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                    ...{ class: "queue-drawer-handle-progress-fill" },
                    ...{ class: ({ 'is-done': row.done }) },
                    ...{ style: ({ width: `${Math.round(row.progress * 100)}%` }) },
                });
                /** @type {__VLS_StyleScopedClasses['queue-drawer-handle-progress-fill']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-done']} */ ;
            }
            // @ts-ignore
            [open, open, t, t, t, t, t, t, t, guestCount, guestCount, peekOrder, peekOrder, peekOrder, peekOrder, peekOrder, handleRows,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "queue-drawer-chevron" },
            ...{ class: ({ 'is-open': open.value }) },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['queue-drawer-chevron']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-open']} */ ;
        (__VLS_unwrap(t, {})('hud.queueDrawer.chevron'));
    }
    // @ts-ignore
    [open, t,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};

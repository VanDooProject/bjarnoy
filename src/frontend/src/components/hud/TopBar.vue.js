/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #16 "header": one continuous full-width bar (not three separately
// floating panels) — logo, settlement name + island/longhouse caption on
// the left, then whatever the caller slots in (ResourceBar, HudNav) filling
// the rest of the row, matching the reference screenshot's single-strip
// layout. The hex logo stands for the game (Bjarnoy) on its own, as in the
// reference — see its title attribute for the accessible name.
//
// Mobile HUD bar rework: below HUD_COMPACT_QUERY (and never when `docked`,
// e.g. the docs pages), the collapsed bar itself becomes a pull-down drag
// surface — Android-notification-shade style — opening a drawer with
// whatever doesn't fit collapsed. See composables/useHudDrawer.ts for the
// drag-to-open/close math, and the `drawer` named slot below for the
// drawer's content (populated by the caller, e.g. MapView's
// MobileHudDrawer). The bar also docks to the top or bottom of the screen
// per stores/hudPrefs.ts's `barPosition` (a user-set preference, not tied to
// the drag gesture). Desktop and `docked` mode are completely untouched:
// no grip, no drawer, no new CSS outside the compact media query.
import { computed, onBeforeUnmount, onMounted, ref, useId, useSlots, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useHudDrawer } from '../../composables/useHudDrawer';
import { isHudDrawerOpen, setHudDrawerCloseFn } from '../../composables/hudDrawerOpenState';
import { isHudBarAtBottom, isHudBarMounted, isHudRail, isSettlementBubbleShown } from '../../composables/hudSettlementBubbleState';
import { isHudDrawerPending } from '../../composables/hudDrawerPendingState';
import { hudBarHeightPx, hudRailHeightPx, hudRailWidthPx, DEFAULT_HUD_BAR_HEIGHT } from '../../composables/hudBarHeight';
import { HUD_COMPACT_QUERY, HUD_RAIL_QUERY } from '../../lib/breakpoints';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const world = useWorldStore();
const hudPrefs = useHudPrefsStore();
const { t } = useI18n({ useScope: 'global' });
const slots = useSlots();
// Mobile tutorial focus: LandingView.vue's founded-branch bar unmounts
// entirely (not just hides) while the phone-width guided build steps run —
// see that view's own `hideBarForTutorial`. DemoModeBadge.vue needs to tell
// that apart from "a bar is mounted, currently at its default 64px height"
// (this component's own `hudBarHeightPx` onBeforeUnmount reset below) so it
// can fall back to the bare screen edge instead of a stale bar offset — see
// hudSettlementBubbleState.ts's own comment on `isHudBarMounted`.
onMounted(() => { isHudBarMounted.value = true; });
onBeforeUnmount(() => { isHudBarMounted.value = false; });
const emit = defineEmits();
const nameTappable = computed(() => !props.title && !!world.hud.settlementName);
const settlementName = computed(() => props.title || world.hud.settlementName || null);
const islandName = computed(() => {
    const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
    if (!settlement?.islandId)
        return null;
    return world.model.listIslands().find((i) => i.id === settlement.islandId)?.name ?? null;
});
const caption = computed(() => {
    if (props.caption)
        return props.caption;
    // A caller that names the bar itself gets only the caption it asked for —
    // a docs page has no island or longhouse to report.
    if (props.title)
        return null;
    const parts = [islandName.value?.toUpperCase(), `LONGHOUSE ${world.hud.level}`].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
});
// --- Mobile pull-down drawer ---
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
// Group C decision (finding #9): the grip/drag/drawer trio is only ever
// warranted when the caller actually gave this bar something to show inside
// the drawer — a bare `<TopBar>` with no `#drawer` slot (the pre-founding
// landing page: just a locale switcher and "I already have a realm") would
// otherwise get a grip that opens an empty sheet. `docked` no longer gates
// this at all (finding #8): every docs-style page that renders `<HudNav>`
// passes a `#drawer` slot of its own now (see those views), so this reduces
// to "is there a drawer slot" regardless of docked/map context.
const hasDrawerSlot = computed(() => !!slots.drawer);
const dragEnabled = computed(() => isCompact.value && hasDrawerSlot.value);
// Landscape rail: on a short landscape phone (HUD_RAIL_QUERY) the full-width
// bar is replaced by a floating column at the top-left — the ☰ button, then
// the resource pills as stacked bubbles — and the drawer opens as a side sheet
// from the left instead of pulling down. Only for a bar that has a drawer to
// open (the pre-founding landing bar, with its title, keeps today's compact
// bar) and that is a map overlay (a docked docs header keeps it too).
const isRailViewport = useMediaQuery(HUD_RAIL_QUERY);
const isRail = computed(() => isCompact.value && isRailViewport.value && hasDrawerSlot.value && !props.docked);
// Portrait phone, `floating` caller (see the prop): no band, just chips. The
// rail wins in landscape — it already floats this same nav content.
const isFloating = computed(() => !!props.floating && isCompact.value && hasDrawerSlot.value && !props.docked && !isRail.value);
// Either chip layout: the ☰ button joins the settlement bubble at the
// top-left instead of a grabber sitting on a band.
const isChipLayout = computed(() => isRail.value || isFloating.value);
// The drawer's drag gesture (pull the bar down, flick it shut) only exists on
// the top/bottom bar — there is no band left to grab in either chip layout,
// so the rail's sheet and the floating bar's drawer open and close by tap.
const dragGestureEnabled = computed(() => dragEnabled.value && !isChipLayout.value);
// Docked pages (docs) are a sticky in-flow header, not a map overlay — there
// is no "bottom of the screen" for them to dock to, so the global
// top/bottom preference (a map-only concept) is forced to 'top' there
// regardless of what the player has chosen for the map bar. The rail and the
// floating chips have no edge to dock to either: they always sit at the top.
const barPosition = computed(() => (props.docked || isChipLayout.value ? 'top' : hudPrefs.barPosition));
// Mobile-only settlement bubble: on a phone the bar has no room for the
// name/caption inline (see `.titles`, hidden below under isCompact), so it
// floats as its own bubble instead — same idea, and the same vertical slot,
// as DemoModeBadge.vue's bubble (tucked below a top-docked bar, or near the
// top itself when the bar has moved to the bottom), just left-aligned and
// always shown regardless of `hideTitle` (that prop only exists to avoid
// clutter next to the in-scene canvas label on a desktop-sized settlement
// view — on mobile there's no such redundancy concern, and the bar's own
// space is too tight to show it any other way).
//
// Finding #10: only ever the *real* in-game settlement, never a page that
// named itself via `title` (a docs page, or the pre-founding landing's
// "Bjarnoy") — those get an inline truncated title in the bar itself
// instead (see `.mobile-title` below), not a second "Lv N · M hexes" bubble
// that has nothing to do with them.
const claimedHexes = computed(() => world.hud.claimedHexes);
/**
 * The floating chips' margin to the screen's top and side edges — the phone
 * settlement bubble's own existing 16px side gutter (`.settlement-bubble`'s
 * `left`), so the gap above the chips equals the gap beside them. Kept in sync
 * with `.hud-bar--floating`'s own `inset`.
 */
const FLOATING_EDGE = '16px';
const showSettlementBubble = computed(() => isCompact.value && !props.title && !!world.hud.settlementName);
// In rail mode there is no bar band at all (hudBarHeightPx is 0): the bubble
// sits at the top edge, to the right of the rail.
// Floating: the same edge margin as at the sides.
const settlementBubbleTop = computed(() => {
    if (isFloating.value)
        return FLOATING_EDGE;
    if (isRail.value)
        return '8px';
    return barPosition.value === 'top' ? `${hudBarHeightPx.value + 8}px` : '8px';
});
// Rail and floating: the ☰ button and the settlement bubble read as one
// capsule — the bubble starts at the chips' own left edge and leaves room for
// the button, which paints above it (the bar is z 40, the bubble z 36).
const settlementBubbleLeft = computed(() => {
    if (isFloating.value)
        return FLOATING_EDGE;
    return isRail.value ? 'calc(8px + env(safe-area-inset-left, 0px))' : undefined;
});
const railJoined = computed(() => isChipLayout.value && showSettlementBubble.value && !isHudDrawerOpen.value);
// Finding #13: only counts as "shown" once it's actually visible on screen —
// the drawer hides it (`v-show="!isHudDrawerOpen"` below) without unmounting
// it, so a plain `showSettlementBubble` alone would keep DemoModeBadge.vue
// pinned below a bubble the player can't currently see.
watch(() => showSettlementBubble.value && !isHudDrawerOpen.value, (shown) => { isSettlementBubbleShown.value = shown; }, { immediate: true });
onBeforeUnmount(() => { isSettlementBubbleShown.value = false; });
// Extra fix found while screenshotting finding #13: DemoModeBadge.vue used
// to read the raw `hudPrefs.barPosition` preference directly to decide
// whether to sit "just under the top bar" or "near the top itself" — wrong
// on a bar that isn't drag/docking-aware at all (a docked docs page, or the
// pre-founding landing bar), which always renders at the top regardless of
// that preference, so a 'bottom' preference made the badge collide with it.
// This mirrors the actual `.hud-bar--bottom` class condition below.
watch(() => dragEnabled.value && barPosition.value === 'bottom', (atBottom) => { isHudBarAtBottom.value = atBottom; }, { immediate: true });
onBeforeUnmount(() => { isHudBarAtBottom.value = false; });
// ResourceBar.vue (stacked pills, no expanded layout) reads this shared flag.
watch(isRail, (rail) => { isHudRail.value = rail; }, { immediate: true });
onBeforeUnmount(() => { isHudRail.value = false; });
const drawerContentRef = ref(null);
const drawerHeight = ref(0);
let drawerObserver = null;
// `drawerContentRef` only becomes non-null once `dragEnabled` is true and
// the `v-if="dragEnabled"` drawer actually mounts into the DOM — which does
// NOT happen by the time this component's own onMounted runs, since
// `isCompact` (from useMediaQuery) flips true in ITS onMounted (registered
// earlier, so it runs first), but that reactive change only triggers a
// re-render on the next tick, after this onMounted has already fired. A
// one-shot `observe()` in onMounted therefore silently observes nothing —
// watching the ref itself (immediate, so it also catches an
// already-mounted case, e.g. HMR) is what actually attaches once the
// element exists, whenever that ends up being.
watch(drawerContentRef, (el) => {
    drawerObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined')
        return;
    drawerObserver = new ResizeObserver((entries) => {
        // Border-box, not `contentRect`: `.hud-drawer-content` is padded
        // (12px top/bottom + the bottom safe-area inset), and `contentRect`
        // excludes padding, which sized the drawer that much too short and
        // cut off its last row (same mistake as the bar's Finding #16 below).
        const entry = entries[0];
        if (!entry)
            return;
        drawerHeight.value = entry.borderBoxSize?.[0]?.blockSize
            ?? entry.target.getBoundingClientRect().height;
    });
    drawerObserver.observe(el);
}, { immediate: true });
onBeforeUnmount(() => drawerObserver?.disconnect());
// The drawer's natural content height (measured above) can exceed the
// actual space below the bar on a short phone — a tall ProfileNudge account
// section, say — which used to open the drawer at its full natural height
// regardless, putting its bottom off-screen with no way to scroll to it
// (nothing here made `.hud-drawer` a scroll container). Capping the drawer
// at whatever room is actually available fixes that; `.hud-drawer-scroll`
// below (with `overflow-y: auto`) is what then lets you reach the rest.
// This same capped value feeds the resting-open offset, the drag clamp AND
// the backdrop opacity fraction (via `useHudDrawer`/`backdropStyle` below)
// so all three agree on what "fully open" means.
const windowInnerHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0);
function onWindowResize() { windowInnerHeight.value = window.innerHeight; }
onMounted(() => window.addEventListener('resize', onWindowResize));
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize));
// Floating: there is no band for the drawer to hang from (hudBarHeightPx is
// 0), so it drops down from just under the chips instead — measured, like the
// band, in `syncBarMeasurements`.
const floatingDrawerTopPx = ref(0);
const drawerTopPx = computed(() => (isFloating.value ? floatingDrawerTopPx.value : hudBarHeightPx.value));
const availableDrawerHeight = computed(() => Math.max(0, Math.min(drawerHeight.value, windowInnerHeight.value - drawerTopPx.value)));
// The rail's side sheet is as tall as the screen and slides sideways, so none
// of the height maths above applies to it.
// The bar itself is no longer always exactly 64px tall on mobile — once the
// drawer is open, ResourceBar's pills switch to their expanded (desktop-style
// stacked) rendering, which is taller. Measure the real height so the drawer
// can sit flush against it, and so other HUD chrome (MapView's insets,
// ArmyPanel's --hud-inset-bottom) can stay clear of it too, rather than
// assuming a fixed 64px. Same "watch the ref" pattern as drawerContentRef
// above, for the same reason.
const barRef = ref(null);
/** The rail's own margin to the screen edges (top and left), see `.hud-bar--rail`. */
const RAIL_MARGIN_PX = 8;
let barObserver = null;
watch(barRef, (el) => {
    barObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined')
        return;
    barObserver = new ResizeObserver(() => {
        syncBarMeasurements();
    });
    barObserver.observe(el);
}, { immediate: true });
// What the (header) element's size means depends on the mode: the full-width
// bar's own height is the top/bottom band every overlay clears; the rail has
// no band (0), and its own footprint is published separately instead.
function syncBarMeasurements() {
    const el2 = barRef.value;
    if (isRail.value) {
        hudBarHeightPx.value = 0;
        if (el2) {
            const rect = el2.getBoundingClientRect();
            // `right`, not `width`: measured from the screen's left edge, so a
            // notch's safe-area inset (which the rail's `left` includes) is cleared too.
            hudRailWidthPx.value = Math.max(0, rect.right - RAIL_MARGIN_PX);
            hudRailHeightPx.value = rect.height + RAIL_MARGIN_PX;
        }
        return;
    }
    hudRailWidthPx.value = 0;
    hudRailHeightPx.value = 0;
    if (isFloating.value) {
        // No band, so nothing for the map's overlays to clear: they reclaim the
        // top of the screen (`--hud-inset-top` 0), as in rail mode.
        hudBarHeightPx.value = 0;
        if (el2)
            floatingDrawerTopPx.value = el2.getBoundingClientRect().bottom + 8;
        return;
    }
    if (el2) {
        // Finding #16: `contentRect` excludes border/padding — this element has
        // a 1px border (`.hud-bar`'s `border-bottom`/`border-top`), so reading
        // it gave 63px on a desktop bar that is actually 64px border-box tall,
        // shifting every consumer of this value (RingMenu's bounds, ArmyPanel's
        // `--hud-inset-bottom`, ...) by a stray pixel. `getBoundingClientRect`
        // reports the real, rendered border-box height regardless of
        // box-sizing, so desktop (where this never actually changes) reads
        // exactly 64 again.
        hudBarHeightPx.value = el2.getBoundingClientRect().height;
    }
}
// Entering/leaving rail mode swaps the whole layout, so re-measure at once
// rather than waiting for the observer (flush 'post': after the class change).
watch([isRail, isFloating], () => syncBarMeasurements(), { flush: 'post', immediate: true });
onBeforeUnmount(() => {
    barObserver?.disconnect();
    hudBarHeightPx.value = DEFAULT_HUD_BAR_HEIGHT;
    hudRailWidthPx.value = 0;
    hudRailHeightPx.value = 0;
});
const drawerScrollRef = ref(null);
const drawerEl = ref(null);
// liveOffset: the rendered height, so grabbing mid open/close animation
// continues from where the drawer is showing rather than its target.
const drawer = useHudDrawer(barPosition, availableDrawerHeight, () => drawerScrollRef.value, () => drawerEl.value?.getBoundingClientRect().height ?? null);
// Finding #12: hands this instance's own `close` to the shared singleton so
// MapView/LandingView's mutual-exclusion watch (opening the queue drawer
// should close this one) can reach it — see hudDrawerOpenState.ts's own
// comment. Only one TopBar with a drawer is ever mounted at a time in
// practice, so there's nothing to arbitrate between multiple writers.
setHudDrawerCloseFn(drawer.close);
onBeforeUnmount(() => setHudDrawerCloseFn(null));
// Finding #19: the grip's `aria-controls` needs a real id to point at, and a
// stable one — a fresh string every render would just churn the attribute
// for no reason.
const drawerContentId = useId();
// Finding #19: Escape closes the open drawer, same as QueueDrawer.vue's own
// keydown handler for its own drawer.
function onDocumentKeydown(e) {
    if (e.key === 'Escape' && drawer.isOpen.value)
        drawer.close();
}
onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));
// Finding #18: crossing the compact breakpoint (rotate/resize) while a drag
// is mid-flight, or while the drawer is open, must not strand the drawer in
// a state its own grip/gesture no longer exists to close (dragEnabled false
// means neither the bar nor the drawer even render any more, per the v-if
// below) — hide it and cancel the drag first so nothing stays open with no
// way left to reach it.
watch(dragEnabled, (enabled) => {
    if (!enabled) {
        drawer.cancelDrag();
        drawer.close();
    }
});
function onBarPointerDown(e) {
    if (dragGestureEnabled.value)
        drawer.onPointerDown(e);
}
function onBarPointerMove(e) {
    if (dragGestureEnabled.value)
        drawer.onPointerMove(e);
}
function onBarPointerUp(e) {
    if (dragGestureEnabled.value)
        drawer.onPointerUp(e);
}
function onBarPointerCancel(e) {
    if (dragGestureEnabled.value)
        drawer.onPointerCancel(e);
}
// Finding #7: wired to both the bar and the drawer's own `lostpointercapture`
// — see useHudDrawer's own comment on why a lost capture must not strand the
// drag.
function onBarLostPointerCapture(e) {
    if (dragGestureEnabled.value)
        drawer.onLostPointerCapture(e);
}
function onBarTouchMove(e) {
    if (dragGestureEnabled.value)
        drawer.onTouchMove(e);
}
function onGripClick() {
    if (dragEnabled.value)
        drawer.toggle();
}
function onClickCapture(e) {
    // Swallow the one synthetic click a drag leaves behind when it started on
    // top of an interactive element — a nav link inside the open drawer
    // (drag-to-close), but also the grip itself or a resource pill on the
    // *collapsed* bar (finding #6: a mouse-drag starting on the grip used to
    // re-toggle it open-then-immediately-closed via that same follow-up
    // click, since only the drawer, not the bar, ever swallowed it). See
    // useHudDrawer's own comment on `consumeClickSuppression`. Capture phase
    // so this runs before the target's own bubble-phase click handler does.
    if (drawer.consumeClickSuppression()) {
        e.stopPropagation();
        e.preventDefault();
    }
}
const drawerVisible = computed(() => dragEnabled.value && (drawer.isOpen.value || drawer.dragging.value));
// Finding #7: this used to mirror `drawerVisible` (open OR dragging), which
// meant ResourceBar swapped its pills to the expanded (drawer-open)
// rendering the instant a drag armed — mid-gesture, before the player had
// actually committed to opening anything. That expanded rendering is a
// different, taller DOM element than the collapsed compact pill, so
// swapping it out from under the finger that is `setPointerCapture`d on it
// silently loses the drag (the captured element gets removed/replaced).
// Only the *committed* state (`isOpen`, set on release) should flip the
// expanded layout — DemoModeBadge.vue reads this same singleton to get out
// of the drawer's way while it's genuinely open, not merely being dragged
// towards open.
watch(drawer.isOpen, (open) => { isHudDrawerOpen.value = open; }, { immediate: true });
onBeforeUnmount(() => { isHudDrawerOpen.value = false; });
// Rail: a left side sheet. Its box is fixed by CSS (`.hud-drawer--rail`); only
// the slide is driven from here, and only the committed open/closed state
// (there is no drag).
// The rail (☰ + pills) stays on screen above the open sheet, so the sheet's
// own content starts to the right of it.
const railDrawerStyle = computed(() => ({
    transform: drawer.isOpen.value ? 'translateX(0)' : 'translateX(-100%)',
    paddingLeft: `${hudRailWidthPx.value + 8}px`,
}));
const drawerStyle = computed(() => ({
    height: `${drawer.currentOffset()}px`,
    transition: drawer.dragging.value ? 'none' : 'height 180ms ease',
    [barPosition.value === 'top' ? 'top' : 'bottom']: `${drawerTopPx.value}px`,
}));
const backdropStyle = computed(() => {
    if (isRail.value) {
        return { opacity: drawer.isOpen.value ? 0.6 : 0, pointerEvents: drawer.isOpen.value ? 'auto' : 'none' };
    }
    const openFraction = availableDrawerHeight.value > 0 ? Math.min(1, drawer.currentOffset() / availableDrawerHeight.value) : 0;
    return {
        opacity: openFraction * 0.6,
        pointerEvents: openFraction > 0 ? 'auto' : 'none',
    };
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
    __VLS_withDotValue(dragEnabled, {});
    __VLS_withDotValue(barPosition, {});
    __VLS_withDotValue(isCompact, {});
    __VLS_withDotValue(settlementName, {});
    __VLS_withDotValue(nameTappable, {});
    __VLS_withDotValue(caption, {});
    __VLS_withDotValue(drawer, {});
    __VLS_withDotValue(isHudDrawerPending, {});
    __VLS_withDotValue(showSettlementBubble, {});
    __VLS_withDotValue(isHudDrawerOpen, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(isRail, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--docked']} */ ;
    /** @type {__VLS_StyleScopedClasses['brand']} */ ;
    /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['mobile-title']} */ ;
    /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['grip-dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
    /** @type {__VLS_StyleScopedClasses['settlement-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['settlement-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['settlement-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer-scroll']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer-scroll']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer-scroll']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer-content']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-drawer--rail-open']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ onPointerdown: (onBarPointerDown) },
        ...{ onPointermove: (onBarPointerMove) },
        ...{ onPointerup: (onBarPointerUp) },
        ...{ onPointercancel: (onBarPointerCancel) },
        ...{ onLostpointercapture: (onBarLostPointerCapture) },
        ...{ onTouchmove: (onBarTouchMove) },
        ...{ onClick: (onClickCapture) },
        ref: "barRef",
        ...{ class: "hud-bar" },
        ...{ style: ({ '--settlement-bubble-top': __VLS_unwrap(settlementBubbleTop, {}) }) },
        ...{ class: ({
                'hud-bar--docked': __VLS_ctx.docked,
                'hud-bar--bottom': dragEnabled.value && barPosition.value === 'bottom',
                'hud-bar--drag-enabled': dragEnabled.value,
                'hud-bar--auto-height': isCompact.value,
                'hud-bar--rail': isRail.value,
                'hud-bar--floating': __VLS_unwrap(isFloating, {}),
                'hud-bar--rail-joined': __VLS_unwrap(railJoined, {}),
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['hud-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--docked']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--bottom']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--drag-enabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--auto-height']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--floating']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-bar--rail-joined']} */ ;
    if (!isCompact.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "brand" },
        });
        /** @type {__VLS_StyleScopedClasses['brand']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "logo-hex" },
            'aria-hidden': "true",
            title: "Bjarnoy",
        });
        /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 100 100",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
            points: "50,4 93,27 93,73 50,96 7,73 7,27",
        });
        if (settlementName.value && !props.hideTitle) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "titles" },
            });
            /** @type {__VLS_StyleScopedClasses['titles']} */ ;
            if (nameTappable.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(!isCompact.value))
                                throw 0;
                            if (!(settlementName.value && !props.hideTitle))
                                throw 0;
                            if (!(nameTappable.value))
                                throw 0;
                            return (__VLS_unwrap(emit, {})('focus-home'));
                            // @ts-ignore
                            [settlementBubbleTop, docked, dragEnabled, dragEnabled, barPosition, isCompact, isCompact, isRail, isFloating, railJoined, settlementName, nameTappable, emit,];
                        } },
                    type: "button",
                    ...{ class: "name name-btn" },
                    title: (__VLS_unwrap(t, {})('hud.focusHome')),
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                /** @type {__VLS_StyleScopedClasses['name-btn']} */ ;
                (settlementName.value);
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                (settlementName.value);
            }
            if (caption.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "caption" },
                });
                /** @type {__VLS_StyleScopedClasses['caption']} */ ;
                (caption.value);
            }
        }
    }
    if (isCompact.value && props.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mobile-title" },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "logo-hex" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 100 100",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
            points: "50,4 93,27 93,73 50,96 7,73 7,27",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "mobile-title-text" },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-title-text']} */ ;
        (props.title);
    }
    if (dragEnabled.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (onGripClick) },
            type: "button",
            ...{ class: "hud-grip" },
            'aria-expanded': (drawer.value.isOpen.value),
            'aria-controls': (__VLS_unwrap(drawerContentId, {})),
            'aria-label': (__VLS_unwrap(t, {})('hud.drawer.toggle')),
        });
        /** @type {__VLS_StyleScopedClasses['hud-grip']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "grip-handle" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['grip-handle']} */ ;
        if (isHudDrawerPending.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "grip-dot" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['grip-dot']} */ ;
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hud-bar-right" },
    });
    /** @type {__VLS_StyleScopedClasses['hud-bar-right']} */ ;
    var __VLS_0 = {};
    if (showSettlementBubble.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settlement-bubble" },
            ...{ class: ({ 'settlement-bubble--rail': __VLS_unwrap(isChipLayout, {}), 'settlement-bubble--floating': __VLS_unwrap(isFloating, {}) }) },
            ...{ style: ({ top: __VLS_unwrap(settlementBubbleTop, {}), left: __VLS_unwrap(settlementBubbleLeft, {}) }) },
        });
        const __VLS_2 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
        __VLS_2(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (!isHudDrawerOpen.value), }, ...__VLS_directiveHookArgsRest(__VLS_2));
        /** @type {__VLS_StyleScopedClasses['settlement-bubble']} */ ;
        /** @type {__VLS_StyleScopedClasses['settlement-bubble--rail']} */ ;
        /** @type {__VLS_StyleScopedClasses['settlement-bubble--floating']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "logo-hex" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['logo-hex']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 100 100",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
            points: "50,4 93,27 93,73 50,96 7,73 7,27",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(showSettlementBubble.value))
                        throw 0;
                    return (__VLS_unwrap(emit, {})('focus-home'));
                    // @ts-ignore
                    [settlementBubbleTop, dragEnabled, isCompact, isFloating, settlementName, settlementName, emit, t, t, caption, caption, drawer, drawerContentId, isHudDrawerPending, showSettlementBubble, isChipLayout, settlementBubbleLeft, isHudDrawerOpen,];
                } },
            type: "button",
            ...{ class: "bubble-name name-btn" },
            title: (__VLS_unwrap(t, {})('hud.focusHome')),
        });
        /** @type {__VLS_StyleScopedClasses['bubble-name']} */ ;
        /** @type {__VLS_StyleScopedClasses['name-btn']} */ ;
        (settlementName.value);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "bubble-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['bubble-meta']} */ ;
        (__VLS_unwrap(t, {})('hud.realmPanel.levelHexesShort', { level: world.value.hud.level, count: __VLS_unwrap(claimedHexes, {}) }));
    }
    if (dragEnabled.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(dragEnabled.value))
                        throw 0;
                    return (drawer.value.close());
                    // @ts-ignore
                    [dragEnabled, settlementName, t, t, drawer, world, claimedHexes,];
                } },
            ...{ class: "hud-drawer-backdrop" },
            ...{ class: ({ 'hud-drawer-backdrop--bottom': barPosition.value === 'bottom' }) },
            ...{ style: (__VLS_unwrap(backdropStyle, {})) },
        });
        const __VLS_3 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
        __VLS_3(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (__VLS_unwrap(drawerVisible, {})), }, ...__VLS_directiveHookArgsRest(__VLS_3));
        /** @type {__VLS_StyleScopedClasses['hud-drawer-backdrop']} */ ;
        /** @type {__VLS_StyleScopedClasses['hud-drawer-backdrop--bottom']} */ ;
    }
    if (dragEnabled.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onPointerdown: (onBarPointerDown) },
            ...{ onPointermove: (onBarPointerMove) },
            ...{ onPointerup: (onBarPointerUp) },
            ...{ onPointercancel: (onBarPointerCancel) },
            ...{ onLostpointercapture: (onBarLostPointerCapture) },
            ...{ onTouchmove: (onBarTouchMove) },
            ...{ onClick: (onClickCapture) },
            ref: "drawerEl",
            ...{ class: "hud-drawer" },
            ...{ class: ({
                    'hud-drawer--bottom': barPosition.value === 'bottom',
                    'hud-drawer--rail': isRail.value,
                    'hud-drawer--rail-open': isRail.value && drawer.value.isOpen.value,
                    'hud-drawer--floating': __VLS_unwrap(isFloating, {}),
                }) },
            ...{ style: (isRail.value ? __VLS_unwrap(railDrawerStyle, {}) : __VLS_unwrap(drawerStyle, {})) },
        });
        /** @type {__VLS_StyleScopedClasses['hud-drawer']} */ ;
        /** @type {__VLS_StyleScopedClasses['hud-drawer--bottom']} */ ;
        /** @type {__VLS_StyleScopedClasses['hud-drawer--rail']} */ ;
        /** @type {__VLS_StyleScopedClasses['hud-drawer--rail-open']} */ ;
        /** @type {__VLS_StyleScopedClasses['hud-drawer--floating']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "drawerScrollRef",
            ...{ class: "hud-drawer-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['hud-drawer-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            id: (__VLS_unwrap(drawerContentId, {})),
            ref: "drawerContentRef",
            ...{ class: "hud-drawer-content" },
            inert: (!drawer.value.isOpen.value),
            'aria-hidden': (!drawer.value.isOpen.value),
        });
        /** @type {__VLS_StyleScopedClasses['hud-drawer-content']} */ ;
        var __VLS_4 = {
            close: (drawer.value.close),
            isOpen: (drawer.value.isOpen.value),
        };
    }
    var __VLS_1 = __VLS_0, __VLS_5 = __VLS_4;
    // @ts-ignore
    [dragEnabled, barPosition, barPosition, isRail, isRail, isRail, isFloating, drawer, drawer, drawer, drawer, drawer, drawerContentId, backdropStyle, drawerVisible, railDrawerStyle, drawerStyle,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_export = {};
export default {};

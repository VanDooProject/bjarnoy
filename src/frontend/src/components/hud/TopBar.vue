<script setup lang="ts">
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
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{
  /**
   * docs/design/zoom-transition.md: settlement mode already floats the
   * settlement's own name badge over the longhouse hex itself
   * (HexMapRenderer.rebuildSettlementLabels) — showing it again here too, plus
   * the island caption, is redundant clutter once you've zoomed all the way
   * in. World mode has no such in-scene badge, so the title stays there.
   */
  hideTitle?: boolean;
  /** Overrides the settlement name — for a page with no settlement of its own (the docs). */
  title?: string;
  /** Overrides the island/longhouse caption. Only shown when there is a title to sit under. */
  caption?: string;
  /**
   * Lay the bar out as a page header rather than a map overlay: it sits in
   * the document (sticky to the scroll container) and takes its own clicks,
   * instead of floating over a canvas and letting them through. The map
   * views leave this off and are unaffected. Also disables the mobile
   * pull-down drawer entirely — a docs page has no map to overlay a drawer
   * onto.
   */
  docked?: boolean;
}>();

const world = useWorldStore();
const hudPrefs = useHudPrefsStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
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

const settlementName = computed(() => props.title || world.hud.settlementName || null);

const islandName = computed(() => {
  const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
  if (!settlement?.islandId) return null;
  return world.model.listIslands().find((i) => i.id === settlement.islandId)?.name ?? null;
});

const caption = computed(() => {
  if (props.caption) return props.caption;
  // A caller that names the bar itself gets only the caption it asked for —
  // a docs page has no island or longhouse to report.
  if (props.title) return null;
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
// The drawer's drag gesture (pull the bar down, flick it shut) only exists on
// the top/bottom bar; the rail's sheet opens and closes by tap.
const dragGestureEnabled = computed(() => dragEnabled.value && !isRail.value);
// Docked pages (docs) are a sticky in-flow header, not a map overlay — there
// is no "bottom of the screen" for them to dock to, so the global
// top/bottom preference (a map-only concept) is forced to 'top' there
// regardless of what the player has chosen for the map bar. The rail has no
// edge to dock to either: it always sits at the top-left.
const barPosition = computed(() => (props.docked || isRail.value ? 'top' : hudPrefs.barPosition));

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
const showSettlementBubble = computed(() => isCompact.value && !props.title && !!world.hud.settlementName);
// In rail mode there is no bar band at all (hudBarHeightPx is 0): the bubble
// sits at the top edge, to the right of the rail.
const settlementBubbleTop = computed(() => (isRail.value ? '8px' : barPosition.value === 'top' ? `${hudBarHeightPx.value + 8}px` : '8px'));
// Rail: the ☰ button and the settlement bubble read as one capsule — the
// bubble starts at the rail's own left edge and leaves room for the button,
// which paints above it (the bar is z 40, the bubble z 36).
const settlementBubbleLeft = computed(() => (isRail.value ? 'calc(8px + env(safe-area-inset-left, 0px))' : undefined));
const railJoined = computed(() => isRail.value && showSettlementBubble.value && !isHudDrawerOpen.value);
// Finding #13: only counts as "shown" once it's actually visible on screen —
// the drawer hides it (`v-show="!isHudDrawerOpen"` below) without unmounting
// it, so a plain `showSettlementBubble` alone would keep DemoModeBadge.vue
// pinned below a bubble the player can't currently see.
watch(
  () => showSettlementBubble.value && !isHudDrawerOpen.value,
  (shown) => { isSettlementBubbleShown.value = shown; },
  { immediate: true },
);
onBeforeUnmount(() => { isSettlementBubbleShown.value = false; });
// Extra fix found while screenshotting finding #13: DemoModeBadge.vue used
// to read the raw `hudPrefs.barPosition` preference directly to decide
// whether to sit "just under the top bar" or "near the top itself" — wrong
// on a bar that isn't drag/docking-aware at all (a docked docs page, or the
// pre-founding landing bar), which always renders at the top regardless of
// that preference, so a 'bottom' preference made the badge collide with it.
// This mirrors the actual `.hud-bar--bottom` class condition below.
watch(
  () => dragEnabled.value && barPosition.value === 'bottom',
  (atBottom) => { isHudBarAtBottom.value = atBottom; },
  { immediate: true },
);
onBeforeUnmount(() => { isHudBarAtBottom.value = false; });
// ResourceBar.vue (stacked pills, no expanded layout) reads this shared flag.
watch(isRail, (rail) => { isHudRail.value = rail; }, { immediate: true });
onBeforeUnmount(() => { isHudRail.value = false; });

const drawerContentRef = ref<HTMLElement | null>(null);
const drawerHeight = ref(0);
let drawerObserver: ResizeObserver | null = null;

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
watch(
  drawerContentRef,
  (el) => {
    drawerObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    drawerObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) drawerHeight.value = rect.height;
    });
    drawerObserver.observe(el);
  },
  { immediate: true },
);
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
const availableDrawerHeight = computed(() =>
  Math.max(0, Math.min(drawerHeight.value, windowInnerHeight.value - hudBarHeightPx.value)),
);
// The rail's side sheet is as tall as the screen and slides sideways, so none
// of the height maths above applies to it.

// The bar itself is no longer always exactly 64px tall on mobile — once the
// drawer is open, ResourceBar's pills switch to their expanded (desktop-style
// stacked) rendering, which is taller. Measure the real height so the drawer
// can sit flush against it, and so other HUD chrome (MapView's insets,
// ArmyPanel's --hud-inset-bottom) can stay clear of it too, rather than
// assuming a fixed 64px. Same "watch the ref" pattern as drawerContentRef
// above, for the same reason.
const barRef = ref<HTMLElement | null>(null);
/** The rail's own margin to the screen edges (top and left), see `.hud-bar--rail`. */
const RAIL_MARGIN_PX = 8;
let barObserver: ResizeObserver | null = null;
watch(
  barRef,
  (el) => {
    barObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    barObserver = new ResizeObserver(() => {
      syncBarMeasurements();
    });
    barObserver.observe(el);
  },
  { immediate: true },
);
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
watch(isRail, () => syncBarMeasurements(), { flush: 'post', immediate: true });
onBeforeUnmount(() => {
  barObserver?.disconnect();
  hudBarHeightPx.value = DEFAULT_HUD_BAR_HEIGHT;
  hudRailWidthPx.value = 0;
  hudRailHeightPx.value = 0;
});

const drawerScrollRef = ref<HTMLElement | null>(null);
const drawer = useHudDrawer(barPosition, availableDrawerHeight, () => drawerScrollRef.value);
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
function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && drawer.isOpen.value) drawer.close();
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

function onBarPointerDown(e: PointerEvent) {
  if (dragGestureEnabled.value) drawer.onPointerDown(e);
}
function onBarPointerMove(e: PointerEvent) {
  if (dragGestureEnabled.value) drawer.onPointerMove(e);
}
function onBarPointerUp(e: PointerEvent) {
  if (dragGestureEnabled.value) drawer.onPointerUp(e);
}
function onBarPointerCancel(e: PointerEvent) {
  if (dragGestureEnabled.value) drawer.onPointerCancel(e);
}
// Finding #7: wired to both the bar and the drawer's own `lostpointercapture`
// — see useHudDrawer's own comment on why a lost capture must not strand the
// drag.
function onBarLostPointerCapture(e: PointerEvent) {
  if (dragGestureEnabled.value) drawer.onLostPointerCapture(e);
}
function onGripClick() {
  if (dragEnabled.value) drawer.toggle();
}
function onClickCapture(e: MouseEvent) {
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
  [barPosition.value === 'top' ? 'top' : 'bottom']: `${hudBarHeightPx.value}px`,
}));
const backdropStyle = computed(() => {
  if (isRail.value) {
    return { opacity: drawer.isOpen.value ? 0.6 : 0, pointerEvents: drawer.isOpen.value ? ('auto' as const) : ('none' as const) };
  }
  const openFraction = availableDrawerHeight.value > 0 ? Math.min(1, drawer.currentOffset() / availableDrawerHeight.value) : 0;
  return {
    opacity: openFraction * 0.6,
    pointerEvents: openFraction > 0 ? ('auto' as const) : ('none' as const),
  };
});
</script>

<template>
  <header
    ref="barRef"
    class="hud-bar"
    :class="{
      'hud-bar--docked': docked,
      'hud-bar--bottom': dragEnabled && barPosition === 'bottom',
      'hud-bar--drag-enabled': dragEnabled,
      'hud-bar--auto-height': isCompact,
      'hud-bar--rail': isRail,
      'hud-bar--rail-joined': railJoined,
    }"
    @pointerdown="onBarPointerDown"
    @pointermove="onBarPointerMove"
    @pointerup="onBarPointerUp"
    @pointercancel="onBarPointerCancel"
    @lostpointercapture="onBarLostPointerCapture"
    @click.capture="onClickCapture"
  >
    <!-- The logo lives in the mobile settlement-bubble instead (below) —
         an empty .brand would still eat the bar's gap for nothing, so it's
         skipped entirely rather than just hiding its contents. -->
    <div v-if="!isCompact" class="brand">
      <span class="logo-hex" aria-hidden="true" title="Bjarnoy">
        <svg viewBox="0 0 100 100">
          <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
        </svg>
      </span>
      <div class="titles" v-if="settlementName && !props.hideTitle">
        <span class="name">{{ settlementName }}</span>
        <span v-if="caption" class="caption">{{ caption }}</span>
      </div>
    </div>
    <!-- Finding #10: a page that named itself via `title` (docs, the
         pre-founding landing) has no settlement bubble to fall back on —
         give it its own compact brand instead, truncated rather than
         pushing the resource/nav content off-screen. -->
    <div v-if="isCompact && props.title" class="mobile-title">
      <span class="logo-hex" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
        </svg>
      </span>
      <span class="mobile-title-text">{{ props.title }}</span>
    </div>
    <!-- Mobile HUD bar rework, phase 2: an Android-notification-shade style
         grabber replaces the old inline chevron button — the owner's
         annotated screenshot called out the chevron (and the avatar) for
         taking space away from the resource pills. This handle takes NONE:
         it's absolutely positioned against the bar's own free edge (see
         `.hud-grip` below), reserved for it via extra bar padding, rather
         than living in the `.hud-bar-right` flex row the pills now have
         entirely to themselves. Same aria wiring and click handler as
         before, and the class name stays `hud-grip` — existing
         tests/selectors already mean "the drawer toggle" by it. -->
    <button
      v-if="dragEnabled"
      type="button"
      class="hud-grip"
      :aria-expanded="drawer.isOpen.value"
      :aria-controls="drawerContentId"
      :aria-label="t('hud.drawer.toggle')"
      @click="onGripClick"
    >
      <span class="grip-handle" aria-hidden="true" />
      <!-- hudDrawerPendingState.ts: the anonymous account-creation nudge
           moves into the drawer on an in-game bar (no room for its usual
           anchored trigger there) — this is its only remaining on-screen
           sign once tucked away. -->
      <span v-if="isHudDrawerPending" class="grip-dot" aria-hidden="true" />
    </button>
    <div class="hud-bar-right">
      <!-- Finding #1: this used to wrap `<slot />` in its own
           `overflow-x: auto` scroller so 5 resource pills + nav + locale
           switcher could fit a phone width — but that clips every
           absolutely-positioned dropdown anywhere inside it (a nav account
           menu, ReturningPlayerMenu's panel, ProfileNudge) to the scroller's
           own ~30px visible height, ON DESKTOP TOO, since this wrapper was
           unconditional. Mobile HUD bar rework, phase 2: ResourceBar's own
           compact pill row briefly took over horizontal scrolling instead
           (`.resource-bar.compact`) — that's gone too now, in favour of
           wrapping onto a second line, since a pill scrolled half past the
           bar's own edge is just as much a "half-cut pill" as one clipped by
           a wrapper (see ResourceBar.vue's own comment). HudNav/
           ReturningPlayerMenu never needed to scroll, they just needed room,
           which removing this wrapper also restores (see `.hud-bar-right`'s
           own `justify-content: flex-end` below, no longer defeated by this
           intermediate flex box). -->
      <slot />
    </div>
  </header>
  <div
    v-if="showSettlementBubble"
    class="settlement-bubble"
    :class="{ 'settlement-bubble--rail': isRail }"
    :style="{ top: settlementBubbleTop, left: settlementBubbleLeft }"
    v-show="!isHudDrawerOpen"
  >
    <span class="logo-hex" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
      </svg>
    </span>
    <span class="bubble-name">{{ settlementName }}</span>
    <span class="bubble-meta">{{ t('hud.realmPanel.levelHexesShort', { level: world.hud.level, count: claimedHexes }) }}</span>
  </div>
  <div
    v-if="dragEnabled"
    class="hud-drawer-backdrop"
    :class="{ 'hud-drawer-backdrop--bottom': barPosition === 'bottom' }"
    :style="backdropStyle"
    v-show="drawerVisible"
    @click="drawer.close()"
  />
  <div
    v-if="dragEnabled"
    class="hud-drawer"
    :class="{ 'hud-drawer--bottom': barPosition === 'bottom', 'hud-drawer--rail': isRail, 'hud-drawer--rail-open': isRail && drawer.isOpen.value }"
    :style="isRail ? railDrawerStyle : drawerStyle"
    @pointerdown="onBarPointerDown"
    @pointermove="onBarPointerMove"
    @pointerup="onBarPointerUp"
    @pointercancel="onBarPointerCancel"
    @lostpointercapture="onBarLostPointerCapture"
    @click.capture="onClickCapture"
  >
    <!-- The collapsed bar (and its grip) stays pinned to the screen's own
         edge even once open, so there is no room to keep dragging past it
         in that direction — closing instead grabs the open drawer itself,
         which has real space to travel. Same pointer handlers as the bar;
         the 8px arm threshold keeps a plain tap on a nav link/resource row
         inside from being mistaken for a drag, exactly as it does on the
         collapsed bar's own resource pills. -->
    <!-- Scroll container between the (overflow: hidden, capped-height)
         `.hud-drawer` and its content: lets a drawer whose natural content
         is taller than the available space actually be scrolled to, both
         by wheel/programmatic scrollIntoView (native, for free) and by
         touch (driven in JS from useHudDrawer's own gesture — see
         `drawerScrollRef`/onBarPointerMove above and its own comment on
         `scrollEl`). Not the ResizeObserver's own target — that stays on
         `.hud-drawer-content` so its contentRect keeps reporting the
         content's natural (unclipped) height, not this wrapper's capped one. -->
    <div ref="drawerScrollRef" class="hud-drawer-scroll">
      <div
        :id="drawerContentId"
        ref="drawerContentRef"
        class="hud-drawer-content"
        :inert="!drawer.isOpen.value"
        :aria-hidden="!drawer.isOpen.value"
      >
        <slot name="drawer" :close="drawer.close" :is-open="drawer.isOpen.value" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud-bar {
  position: absolute;
  inset: 0 0 auto 0;
  /* Above RingMenu's full-screen backdrop (z-index 30) so a header button
     (e.g. "World map") always gets the real click even while a ring is
     open, instead of the backdrop intercepting it and treating the press
     as a map click. */
  z-index: 40;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  background: linear-gradient(180deg, rgba(6, 12, 16, 0.94), rgba(6, 12, 16, 0.82));
  border-bottom: 1px solid var(--panel-border);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  /* An opaque strip across the top of the map: a click anywhere on it —
     not only on a nav button — belongs to the bar and must never reach the
     canvas behind it (it used to be `pointer-events: none`, from when the
     header was just a corner logo, so a click that missed a link by a few
     pixels selected/opened whatever hex happened to be under the bar).
     Anything that hangs *below* the bar sets its own pointer-events:
     ProfileNudge opts out (its text must not eat map clicks), the dropdown
     panels (HudNav's account menu, ReturningPlayerMenu's `.menu`) opt in. */
  pointer-events: auto;
}
/* Still needed although the bar itself takes clicks now: ProfileNudge sets
   `pointer-events: none` on its floating panel, and its buttons inherit
   that unless something opts them back in. */
.hud-bar-right :deep(button) {
  pointer-events: auto;
}
/* A page header rather than a map overlay: in the document flow, stuck to
   the top of whichever ancestor scrolls (the docs pages make themselves the
   scroll container), and taking its own clicks since there is no map behind
   it to click through to. */
.hud-bar--docked {
  position: sticky;
  inset: auto;
  top: 0;
  pointer-events: auto;
}
.hud-bar--docked .brand {
  pointer-events: auto;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  pointer-events: none;
}
.logo-hex {
  width: 28px;
  height: 28px;
  flex: none;
}
.logo-hex svg {
  width: 100%;
  height: 100%;
}
.logo-hex polygon {
  fill: var(--gold);
  stroke: #20160a;
  stroke-width: 4;
}
.titles {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.name {
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
}
.caption {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.hud-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-end;
}
/* Finding #10: the inline brand for a page that named itself via `title`
   (docs pages, the pre-founding landing) — the settlement bubble is reserved
   for a real in-game settlement (see `showSettlementBubble`), so these pages
   get their name here instead, shrinking/truncating rather than crowding out
   the resource pills or nav. */
.mobile-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
}
.mobile-title .logo-hex {
  width: 20px;
  height: 20px;
}
.mobile-title-text {
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mobile-only: the collapsed bar itself is the drag surface, so it needs to
   actually receive pointer events (desktop leaves the bar pointer-events:none
   and unaffected). */
.hud-bar--drag-enabled {
  pointer-events: auto;
  touch-action: none;
}
/* Mobile HUD bar rework, phase 2: reserve a thin strip on the bar's own free
   edge (the edge with nothing docked to it) for the grip handle below, so it
   never eats into the row the pills use — see `.hud-grip`'s own comment.
   Top-docked (the default): the free edge is the bottom, so the strip is
   extra padding-bottom. `:not(.hud-bar--bottom)` matters here, not just for
   clarity — `.hud-bar--bottom` below sets its own `padding-bottom` (the
   physical screen edge's safe-area inset) at equal specificity, and later in
   this stylesheet, so an unqualified rule here would silently overwrite it
   whenever a bar is both bottom-docked and drag-enabled. */
.hud-bar--drag-enabled:not(.hud-bar--bottom) {
  padding-bottom: 20px;
}
.hud-bar--bottom {
  inset: auto 0 0 0;
  border-bottom: none;
  border-top: 1px solid var(--panel-border);
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.35);
  background: linear-gradient(0deg, rgba(6, 12, 16, 0.94), rgba(6, 12, 16, 0.82));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
/* Mobile only: the bar grows to fit ResourceBar's expanded (drawer-open)
   stacked pills instead of clipping them at a fixed 64px — desktop's plain
   `.hud-bar` rule above (height: 64px) is untouched, since this class is
   only ever applied under HUD_COMPACT_QUERY. */
.hud-bar--auto-height {
  height: auto;
  min-height: 64px;
}
/* Bottom-docked: the free edge is the top instead — `.hud-bar--bottom`
   above keeps its own `padding-bottom` (the attached, physical screen edge's
   safe-area inset) untouched; this adds the handle's reserved space on top
   of it. Paired with `.hud-bar--drag-enabled` so a page whose bar has no
   drawer at all never reserves space for a handle it doesn't render. */
.hud-bar--drag-enabled.hud-bar--bottom {
  padding-top: 20px;
}
/* In-game phone bar: the resource pills are the only thing left in it, and
   their row spreads its free space evenly (`space-evenly`) — the bar's own
   20px side padding on top of that made both ends visibly wider than the
   gaps between pills, clumping them towards the middle. Let the row own the
   full width so the outer gaps equal the inner ones. Docs-style bars (title
   + trigger, no ResourceBar) keep their padding. */
.hud-bar--drag-enabled:has(.resource-bar) {
  padding-left: 0;
  padding-right: 0;
}
/* Android-notification-shade style grabber: a short rounded bar centred on
   the reserved strip above, not a chevron — the owner's annotated screenshot
   asked for the chevron gone entirely, not just relabelled. `position:
   absolute` against `.hud-bar` (already positioned, see its own `position`
   rule) takes it out of the pill row's flex flow completely, so it can never
   be "half cut" alongside them regardless of how many pills there are. The
   44x20px hit area comfortably clears the usual ~44px touch-target floor
   despite the handle itself only being visually 36x4px. */
.hud-grip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  z-index: 1;
  width: 44px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
.hud-bar--bottom .hud-grip {
  bottom: auto;
  top: 0;
}
.hud-grip:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}
.grip-handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--muted);
  opacity: 0.55;
  transition: opacity 150ms ease;
}
.hud-grip:hover .grip-handle,
.hud-grip:focus-visible .grip-handle {
  opacity: 0.9;
}
.grip-dot {
  position: absolute;
  top: 1px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rival);
  border: 1.5px solid var(--shell);
}
.hud-bar--bottom .grip-dot {
  top: auto;
  bottom: 1px;
}

/* Landscape rail (see `isRail` in the script): on a short landscape phone the
   full-width bar is replaced by a floating column at the top-left, with no
   bar background — the round ☰ button first, then ResourceBar's pills as
   stacked bubbles (their own styling lives in ResourceBar.vue). The header
   itself lets clicks through to the map between the bubbles; each bubble
   takes its own. `.hud-bar.hud-bar--rail.hud-bar--drag-enabled` out-ranks
   every padding/pointer/height rule of the bar above regardless of order. */
.hud-bar.hud-bar--rail.hud-bar--drag-enabled {
  inset: 8px auto auto calc(8px + env(safe-area-inset-left, 0px));
  width: max-content;
  height: auto;
  min-height: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 0;
  background: none;
  border: none;
  box-shadow: none;
  pointer-events: none;
  touch-action: auto;
}
.hud-bar--rail .hud-bar-right {
  flex: none;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 6px;
  pointer-events: none;
}
/* A bar with no ResourceBar in it (the founded landing page) keeps its nav
   content, as one more bubble in the column. */
.hud-bar--rail .hud-bar-right :deep(.hud-nav) {
  /* Floats in the top-right corner rather than in the left column, so its
     popovers (the account-creation nudge, the returning-player menu) hang
     down from there the way they do from a top bar. */
  position: fixed;
  top: 8px;
  right: calc(8px + env(safe-area-inset-right, 0px));
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: rgba(6, 12, 16, 0.94);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}
/* The ☰ button: the same dark translucent circle as the settlement bubble
   and the Trade button. Static (first item of the column), not absolutely
   positioned like the pull-down grabber. The glyph is CSS-drawn (the
   grabber's `.grip-handle` span, as three stacked lines via box-shadow) so
   no raw text sits in the template. */
.hud-bar--rail .hud-grip {
  /* Relative, not the grabber's absolute: first item of the column (and the
     anchor of the pending dot below). */
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(6, 12, 16, 0.94);
  border: 1px solid var(--panel-border);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
.hud-bar--rail .hud-grip:focus-visible {
  border-radius: 50%;
}
.hud-bar--rail .grip-handle {
  width: 16px;
  height: 2px;
  background: var(--text);
  opacity: 0.9;
  box-shadow: 0 -5px 0 var(--text), 0 5px 0 var(--text);
}
.hud-bar--rail .grip-dot {
  top: 5px;
  right: 5px;
}
/* The ☰ button inside the settlement bubble's capsule (`railJoined`): it
   drops its own circle so the two read as one pill. */
.hud-bar--rail-joined .hud-grip {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.settlement-bubble.settlement-bubble--rail {
  height: 40px;
  box-sizing: border-box;
  padding-left: 48px;
}
/* Mobile-only settlement bubble — replaces the inline `.titles` name/caption
   (hidden above under isCompact) since the bar itself has no room for it.
   `top` is set inline (settlementBubbleTop) to land in the same slot
   DemoModeBadge.vue's own bubble uses, just left-aligned instead of
   centered — capped under half the screen width so it can never collide
   with that badge's own (right-aligned, similarly capped) bubble sharing
   the row. */
.settlement-bubble {
  position: fixed;
  left: 16px;
  /* Under every panel that can open over it — the queue drawer (37/38), the
     HUD drawer (39) and this bar's own popovers (the returning-player menu,
     ProfileNudge, the account menu, which live inside `.hud-bar` and so
     rank as 40 from the outside). At 41 it painted over all of them. */
  z-index: 36;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(58vw - 16px);
  padding: 6px 14px 6px 8px;
  border-radius: 999px;
  background: rgba(6, 12, 16, 0.94);
  border: 1px solid var(--panel-border);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  overflow: hidden;
}
.settlement-bubble .logo-hex {
  /* .logo-hex's own svg/polygon rules (shared with .brand's logo above)
     already handle fill/stroke — only the size differs here. */
  width: 20px;
  height: 20px;
}
.bubble-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bubble-meta {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  flex: none;
}

.hud-drawer-backdrop {
  position: fixed;
  inset: 0;
  /* Finding #12: was 38, tied with QueueDrawer.vue's own `.queue-drawer`
     (also 38) — at equal z-index, whichever painted later in the DOM won
     the tie, which happened to be the queue rail (it mounts after TopBar in
     MapView.vue's template), so this backdrop failed to dim it while the
     HUD drawer was open. 39 (matching `.hud-drawer` below — see that rule's
     own comment on why tying the two together here is safe) puts both
     strictly above QueueDrawer's 37/38 while staying below the collapsed
     bar itself (`.hud-bar`, 40) and true modals (BuildingModal/TrainingModal/
     TopBar, 40; ReturningPlayerMenu/ProfileNudge, 50). MapView.vue's mutual
     -exclusion watch (opening one drawer closes the other) means the two are
     never actually both open at once in practice — this is the defense in
     depth for the transition frame where they briefly could be. */
  z-index: 39;
  background: #000;
  transition: opacity 120ms ease;
}

.hud-drawer {
  /* `top`/`bottom` come from the inline `drawerStyle` binding — the bar's
     real, current (possibly expanded) height, not a fixed guess.
     Finding #8: `fixed`, not `absolute` — a docked bar (docs pages) is a
     `position: sticky` header inside a page that scrolls itself
     (`.docs { overflow: auto }` and friends), which is not itself a
     positioned ancestor, so an `absolute` drawer here would be positioned
     against the document root and scroll away instead of staying pinned
     under the sticky bar. `fixed` always pins to the viewport, which is
     also exactly what the non-docked map views already got from `absolute`
     (their positioned ancestor is a `position: relative` root that already
     fills the viewport with no scroll offset of its own), so this is a
     no-op there. */
  position: fixed;
  left: 0;
  right: 0;
  /* Same value as `.hud-drawer-backdrop` above on purpose — ties resolve by
     document order in the same stacking context, and this element is always
     the later sibling of the two in the template below, so it still paints
     above its own backdrop. See that rule's own comment for why 39. */
  z-index: 39;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(6, 12, 16, 0.97), rgba(6, 12, 16, 0.93));
  border-bottom: 1px solid var(--panel-border);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  touch-action: none;
}
.hud-drawer--bottom {
  border-bottom: none;
  border-top: 1px solid var(--panel-border);
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.35);
}
.hud-drawer-scroll {
  /* Always exactly the drawer's own (capped, possibly mid-drag) height —
     `.hud-drawer`'s `overflow: hidden` stays the outer clip, this is what
     actually scrolls. Plain top-anchored `scrollTop` semantics (0 = start)
     regardless of docking edge on purpose — `column-reverse` (used directly
     on `.hud-drawer` before this scroll wrapper existed, purely to anchor a
     shorter-than-available bottom-docked drawer's content against the bar)
     would flip what `scrollTop` even means in a standards-compliant
     browser, which useHudDrawer's touch-scroll math (`splitDrawerDragDelta`)
     assumes is the same for both edges. `overscroll-behavior: contain`
     keeps an already-at-the-end wheel/touch scroll from bubbling into a
     page scroll behind it. */
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.hud-drawer--bottom .hud-drawer-scroll {
  /* A flex column (not `column-reverse`, which would flip `scrollTop`
     semantics — see the comment above) so `.hud-drawer-content`'s own
     `margin-top: auto` below can push it. */
  display: flex;
  flex-direction: column;
}
.hud-drawer-content {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
}
.hud-drawer--bottom .hud-drawer-content {
  /* Restores the bottom-docked drawer's own anchoring — the content used to
     sit flush against the bar (the edge nearest it, screen bottom) rather
     than the drawer's top, via `column-reverse` directly on `.hud-drawer`
     before the scroll wrapper above existed. `margin-top: auto` reproduces
     that for a shorter-than-available drawer (mid-drag, or resting open
     with room to spare) while staying scrollable once the content actually
     overflows: unlike `justify-content: flex-end` on the scroll container
     (which pushes overflowing content's own start past the scrollable
     area's top, making it unreachable), a margin on the content itself only
     ever collapses to 0 once there's no spare space left to push through. */
  margin-top: auto;
}

/* Landscape rail: the drawer is a side sheet from the left instead of a
   pull-down — full height, slid in by the inline `transform` (see
   `railDrawerStyle`). No drag, so no `touch-action: none` either. */
.hud-drawer--rail {
  top: 0;
  bottom: 0;
  left: 0;
  right: auto;
  width: min(300px, 80vw);
  height: auto;
  box-sizing: border-box;
  border-bottom: none;
  border-right: 1px solid var(--panel-border);
  box-shadow: 12px 0 30px rgba(0, 0, 0, 0.35);
  background: linear-gradient(90deg, rgba(6, 12, 16, 0.97), rgba(6, 12, 16, 0.93));
  touch-action: auto;
  /* Hidden once slid out (after the slide, so it still animates away): its
     shadow must not bleed onto the screen's edge, nor its content be focusable. */
  visibility: hidden;
  transition: transform 180ms ease, visibility 0s linear 180ms;
}
.hud-drawer--rail-open {
  visibility: visible;
  transition: transform 180ms ease, visibility 0s;
}
@media (prefers-reduced-motion: reduce) {
  .hud-drawer--rail,
  .hud-drawer--rail-open {
    transition: none;
  }
}
</style>

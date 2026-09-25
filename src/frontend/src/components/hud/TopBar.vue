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
import { isHudBarAtBottom, isSettlementBubbleShown } from '../../composables/hudSettlementBubbleState';
import { isHudDrawerPending } from '../../composables/hudDrawerPendingState';
import { hudBarHeightPx, DEFAULT_HUD_BAR_HEIGHT } from '../../composables/hudBarHeight';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
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
// Docked pages (docs) are a sticky in-flow header, not a map overlay — there
// is no "bottom of the screen" for them to dock to, so the global
// top/bottom preference (a map-only concept) is forced to 'top' there
// regardless of what the player has chosen for the map bar.
const barPosition = computed(() => (props.docked ? 'top' : hudPrefs.barPosition));

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
const settlementBubbleTop = computed(() => (barPosition.value === 'top' ? `${hudBarHeightPx.value + 8}px` : '8px'));
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

// The bar itself is no longer always exactly 64px tall on mobile — once the
// drawer is open, ResourceBar's pills switch to their expanded (desktop-style
// stacked) rendering, which is taller. Measure the real height so the drawer
// can sit flush against it, and so other HUD chrome (MapView's insets,
// ArmyPanel's --hud-inset-bottom) can stay clear of it too, rather than
// assuming a fixed 64px. Same "watch the ref" pattern as drawerContentRef
// above, for the same reason.
const barRef = ref<HTMLElement | null>(null);
let barObserver: ResizeObserver | null = null;
watch(
  barRef,
  (el) => {
    barObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    barObserver = new ResizeObserver(() => {
      // Finding #16: `contentRect` excludes border/padding — this element has
      // a 1px border (`.hud-bar`'s `border-bottom`/`border-top`), so reading
      // it gave 63px on a desktop bar that is actually 64px border-box tall,
      // shifting every consumer of this value (RingMenu's bounds, ArmyPanel's
      // `--hud-inset-bottom`, ...) by a stray pixel. `getBoundingClientRect`
      // reports the real, rendered border-box height regardless of
      // box-sizing, so desktop (where this never actually changes) reads
      // exactly 64 again.
      const el2 = barRef.value;
      if (el2) hudBarHeightPx.value = el2.getBoundingClientRect().height;
    });
    barObserver.observe(el);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  barObserver?.disconnect();
  hudBarHeightPx.value = DEFAULT_HUD_BAR_HEIGHT;
});

const drawer = useHudDrawer(barPosition, drawerHeight);
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
  if (dragEnabled.value) drawer.onPointerDown(e);
}
function onBarPointerMove(e: PointerEvent) {
  if (dragEnabled.value) drawer.onPointerMove(e);
}
function onBarPointerUp(e: PointerEvent) {
  if (dragEnabled.value) drawer.onPointerUp(e);
}
function onBarPointerCancel(e: PointerEvent) {
  if (dragEnabled.value) drawer.onPointerCancel(e);
}
// Finding #7: wired to both the bar and the drawer's own `lostpointercapture`
// — see useHudDrawer's own comment on why a lost capture must not strand the
// drag.
function onBarLostPointerCapture(e: PointerEvent) {
  if (dragEnabled.value) drawer.onLostPointerCapture(e);
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
const drawerStyle = computed(() => ({
  height: `${drawer.currentOffset()}px`,
  transition: drawer.dragging.value ? 'none' : 'height 180ms ease',
  [barPosition.value === 'top' ? 'top' : 'bottom']: `${hudBarHeightPx.value}px`,
}));
const backdropStyle = computed(() => {
  const openFraction = drawerHeight.value > 0 ? Math.min(1, drawer.currentOffset() / drawerHeight.value) : 0;
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
  </header>
  <div
    v-if="showSettlementBubble"
    class="settlement-bubble"
    :style="{ top: settlementBubbleTop }"
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
    :class="{ 'hud-drawer--bottom': barPosition === 'bottom' }"
    :style="drawerStyle"
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
  /* The bar spans the full canvas width, but only its own content (nav
     buttons) should intercept clicks — the map behind it stays interactive
     everywhere else, matching the old corner-logo behaviour. */
  pointer-events: none;
}
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
  z-index: 41;
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
  display: flex;
  flex-direction: column-reverse;
}
.hud-drawer-content {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
}
</style>

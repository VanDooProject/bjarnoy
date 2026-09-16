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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useHudDrawer } from '../../composables/useHudDrawer';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
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
const dragEnabled = computed(() => isCompact.value && !props.docked);
const barPosition = computed(() => hudPrefs.barPosition);

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

const drawer = useHudDrawer(barPosition, drawerHeight);

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
function onGripClick() {
  if (dragEnabled.value) drawer.toggle();
}
function onDrawerClickCapture(e: MouseEvent) {
  // Swallow the one synthetic click a drag-to-close gesture leaves behind
  // when it started on top of an interactive element (a nav link) — see
  // useHudDrawer's own comment on `consumeClickSuppression`. Capture phase
  // so this runs before the link's own bubble-phase click handler does.
  if (drawer.consumeClickSuppression()) {
    e.stopPropagation();
    e.preventDefault();
  }
}

const drawerVisible = computed(() => dragEnabled.value && (drawer.isOpen.value || drawer.dragging.value));
// DemoModeBadge.vue reads this shared singleton so it can get out of the
// drawer's way while it's open — its own fixed top offset otherwise lands
// right on top of the drawer's first content row.
watch(drawerVisible, (visible) => { isHudDrawerOpen.value = visible; }, { immediate: true });
onBeforeUnmount(() => { isHudDrawerOpen.value = false; });
const drawerStyle = computed(() => ({
  height: `${drawer.currentOffset()}px`,
  transition: drawer.dragging.value ? 'none' : 'height 180ms ease',
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
    class="hud-bar"
    :class="{ 'hud-bar--docked': docked, 'hud-bar--bottom': dragEnabled && barPosition === 'bottom', 'hud-bar--drag-enabled': dragEnabled }"
    @pointerdown="onBarPointerDown"
    @pointermove="onBarPointerMove"
    @pointerup="onBarPointerUp"
    @pointercancel="onBarPointerCancel"
  >
    <div class="brand">
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
    <div class="hud-bar-right">
      <!-- Compact mode has too little width to guarantee everything fits
           (5 resource pills + the nav trigger + locale switcher) — scroll
           this inner row horizontally rather than silently overflowing off
           either edge. Unconditional (not just under dragEnabled) so it
           costs nothing on desktop, where the content already fits and this
           never engages. The grip stays outside it so it's always reachable
           regardless of scroll position. -->
      <div class="hud-bar-scroll">
        <slot />
      </div>
      <button
        v-if="dragEnabled"
        type="button"
        class="hud-grip"
        :aria-expanded="drawer.isOpen.value"
        :aria-label="t('hud.drawer.toggle')"
        @click="onGripClick"
      >
        <span class="chevron" :class="{ open: drawer.isOpen.value }" aria-hidden="true" />
      </button>
    </div>
  </header>
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
    @click.capture="onDrawerClickCapture"
  >
    <!-- The collapsed bar (and its grip) stays pinned to the screen's own
         edge even once open, so there is no room to keep dragging past it
         in that direction — closing instead grabs the open drawer itself,
         which has real space to travel. Same pointer handlers as the bar;
         the 8px arm threshold keeps a plain tap on a nav link/resource row
         inside from being mistaken for a drag, exactly as it does on the
         collapsed bar's own resource pills. -->
    <div ref="drawerContentRef" class="hud-drawer-content">
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
.hud-bar-scroll {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.hud-bar-scroll::-webkit-scrollbar {
  display: none;
}

/* Mobile-only: the collapsed bar itself is the drag surface, so it needs to
   actually receive pointer events (desktop leaves the bar pointer-events:none
   and unaffected). */
.hud-bar--drag-enabled {
  pointer-events: auto;
  touch-action: none;
}
.hud-bar--bottom {
  inset: auto 0 0 0;
  border-bottom: none;
  border-top: 1px solid var(--panel-border);
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.35);
  background: linear-gradient(0deg, rgba(6, 12, 16, 0.94), rgba(6, 12, 16, 0.82));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.hud-grip {
  flex: none;
  width: 28px;
  height: 36px;
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
.hud-grip:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}
.chevron {
  width: 10px;
  height: 10px;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(45deg);
  transition: transform 150ms ease;
}
.chevron.open {
  transform: rotate(225deg);
}

.hud-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 38;
  background: #000;
  transition: opacity 120ms ease;
}

.hud-drawer {
  position: absolute;
  left: 0;
  right: 0;
  top: 64px;
  z-index: 39;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(6, 12, 16, 0.97), rgba(6, 12, 16, 0.93));
  border-bottom: 1px solid var(--panel-border);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  touch-action: none;
}
.hud-drawer--bottom {
  top: auto;
  bottom: 64px;
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

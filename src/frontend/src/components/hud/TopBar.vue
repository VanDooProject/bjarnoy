<script setup lang="ts">
// Issue #16 "header": one continuous full-width bar (not three separately
// floating panels) — logo, settlement name + island/longhouse caption on
// the left, then whatever the caller slots in (ResourceBar, HudNav) filling
// the rest of the row, matching the reference screenshot's single-strip
// layout. The hex logo stands for the game (Bjarnoy) on its own, as in the
// reference — see its title attribute for the accessible name.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useDragSheet } from '../../composables/useDragSheet';
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
   * views leave this off and are unaffected.
   */
  docked?: boolean;
  /**
   * Which edge of the screen the bar sits on. Debug/UX-research flag only
   * (see useHudPosition.ts) — not a user-facing setting yet. Ignored when
   * `docked`, since a docs page header always belongs at the top of its
   * document.
   */
  position?: 'top' | 'bottom';
  /**
   * Replaces the plain header with a draggable bar: a drag handle appears
   * on its free edge, and dragging (or tapping) it toggles the `expanded`
   * slot open/closed beneath (or above, when `position` is "bottom") the
   * bar. Off by default — only the mobile map HUD opts in.
   */
  draggable?: boolean;
}>();

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const isBottom = computed(() => !props.docked && props.position === 'bottom');
// useHudPosition is a debug/UX-research flag only (see its own comments) —
// it isn't expected to flip mid-session, so the drag direction is fixed at
// mount rather than kept reactive to props.position.
const { expanded, onPointerDown, onPointerMove, onPointerUp } = useDragSheet(false, {
  invert: isBottom.value,
});
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
</script>

<template>
  <header class="hud-bar" :class="{ 'hud-bar--docked': docked, 'hud-bar--bottom': !docked && position === 'bottom' }">
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
      <slot />
    </div>
    <button
      v-if="draggable"
      type="button"
      class="drag-handle"
      :class="{ 'drag-handle--bottom': isBottom }"
      :aria-expanded="expanded"
      :aria-label="expanded ? t('hud.dragHandle.collapse') : t('hud.dragHandle.expand')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="drag-handle-pill" aria-hidden="true" />
    </button>
  </header>
  <div
    v-if="draggable"
    class="hud-expanded"
    :class="{ 'hud-expanded--open': expanded, 'hud-expanded--bottom': isBottom }"
  >
    <slot name="expanded" />
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
/* Debug/UX-research flag (useHudPosition.ts): pin the bar to the bottom
   edge instead of the top, flipping the gradient/shadow/border to match so
   it still reads as "anchored to this edge" rather than a top bar dropped
   in the wrong place. */
.hud-bar--bottom {
  inset: auto 0 0 0;
  background: linear-gradient(0deg, rgba(6, 12, 16, 0.94), rgba(6, 12, 16, 0.82));
  border-bottom: none;
  border-top: 1px solid var(--panel-border);
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.35);
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
/* ResourceBar + HudNav together are wider than a phone screen (HudNav alone
   carries 7+ text links plus the locale switcher and avatar) — `flex-end`
   with no shrink or wrap used to just push ResourceBar off the left edge of
   the bar entirely, past the viewport, so on mobile the header showed only
   the tail end of the nav links and no resource pills at all. Scrolling
   this row instead keeps ResourceBar (the primary content per the mobile
   HUD's own design) anchored at its natural left position and lets the
   nav overflow into a swipe, rather than silently disappearing. */
.hud-bar-right {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  pointer-events: auto;
}
.hud-bar-right::-webkit-scrollbar {
  display: none;
}
@media (min-width: 700px) {
  /* Wide enough for both in full — pin the nav to the bar's right edge like
     before instead of leaving a scrollable gap nothing needs to scroll. */
  .hud-bar-right {
    justify-content: flex-end;
  }
}
/* Drag handle: a small pill hanging off the bar's free edge (below it for a
   top-pinned bar, above it for a bottom-pinned one) so it reads as
   belonging to that edge rather than floating in the middle of the map. */
.drag-handle {
  position: absolute;
  left: 50%;
  bottom: -14px;
  transform: translateX(-50%);
  width: 56px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}
.drag-handle--bottom {
  bottom: auto;
  top: -14px;
}
.drag-handle-pill {
  display: block;
  margin: 4px auto 0;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-border);
}
.drag-handle--bottom .drag-handle-pill {
  margin: 0 auto 4px;
}
/* The expanded panel (construction/training summary, etc.) sits directly
   against the bar's free edge, collapsed to zero height until dragged (or
   tapped) open — see useDragSheet.ts. */
.hud-expanded {
  position: absolute;
  left: 0;
  right: 0;
  top: 64px;
  z-index: 39;
  max-height: 0;
  overflow: hidden;
  pointer-events: none;
  transition: max-height 0.2s ease;
}
.hud-expanded--open {
  max-height: 320px;
  pointer-events: auto;
  border-top: 1px solid var(--panel-border);
}
.hud-expanded--bottom {
  top: auto;
  bottom: 64px;
}
.hud-expanded--bottom.hud-expanded--open {
  border-top: none;
  border-bottom: 1px solid var(--panel-border);
}
</style>

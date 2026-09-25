<script setup lang="ts">
// Issue #16 "header": one continuous full-width bar (not three separately
// floating panels) — logo, settlement name + island/longhouse caption on
// the left, then whatever the caller slots in (ResourceBar, HudNav) filling
// the rest of the row, matching the reference screenshot's single-strip
// layout. The hex logo stands for the game (Bjarnoy) on its own, as in the
// reference — see its title attribute for the accessible name.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useWorldStore } from '../../stores/world';

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
}>();

const world = useWorldStore();
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

// Mobile audit: on narrow viewports the bar wraps to a second row (ResourceBar
// sitting under the brand/nav row) and grows past its desktop 64px height.
// Sibling overlays anchored with a fixed offset from the header (TradePanel's
// toggle/popover) need to know the *real* rendered height to sit below it
// instead of overlapping — publish it as a CSS var on the parent element
// rather than threading a prop through every caller. ResizeObserver isn't
// available in jsdom unit tests, so this is a no-op there (the var's CSS
// fallback covers desktop-shaped tests).
const barEl = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !barEl.value?.parentElement) return;
  const parent = barEl.value.parentElement;
  resizeObserver = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height;
    if (height) parent.style.setProperty('--hud-bar-h', `${Math.round(height)}px`);
  });
  resizeObserver.observe(barEl.value);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  barEl.value?.parentElement?.style.removeProperty('--hud-bar-h');
});
</script>

<template>
  <header ref="barEl" class="hud-bar" :class="{ 'hud-bar--docked': docked }">
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
  </header>
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
  gap: 24px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-end;
}

/* Mobile audit (390px iPhone 13): HudNav and ResourceBar are both `flex: none`
   slotted children fighting the brand block for a single fixed-height 64px
   row, which is what pushes them off-screen to the left. Wrap the bar into a
   two-row header instead — brand + nav on row one, ResourceBar (when present)
   flowing onto its own full-width row two — and let `.hud-bar-right` stop
   being its own flex box so its children (HudNav, ResourceBar) lay out
   directly against `.hud-bar`'s own wrap, each free to pick its own
   `order`/`flex-basis` (see ResourceBar.vue/HudNav.vue's own mobile rules). */
@media (max-width: 768px) {
  .hud-bar {
    height: auto;
    min-height: 56px;
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 8px 12px;
  }
  .hud-bar-right {
    display: contents;
  }
  /* Basis 0, not auto: the brand gives up its width (ellipsising the
     title) before the nav controls get wrapped onto a row of their own, so
     the bar stays one row unless a ResourceBar asks for the second. */
  .brand {
    flex: 1 1 0;
    min-width: 0;
  }
  .titles {
    min-width: 0;
  }
  .name,
  .caption {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>

<script setup lang="ts">
// Issue #16 "header": one continuous full-width bar (not three separately
// floating panels) — logo, settlement name + island/longhouse caption on
// the left, then whatever the caller slots in (ResourceBar, HudNav) filling
// the rest of the row, matching the reference screenshot's single-strip
// layout. The hex logo stands for the game (Bjarnoy) on its own, as in the
// reference — see its title attribute for the accessible name.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();
const settlementName = computed(() => world.hud.settlementName || null);

const islandName = computed(() => {
  const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
  if (!settlement?.islandId) return null;
  return world.model.listIslands().find((i) => i.id === settlement.islandId)?.name ?? null;
});

const caption = computed(() => {
  const parts = [islandName.value?.toUpperCase(), `LONGHOUSE ${world.hud.level}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
});
</script>

<template>
  <header class="hud-bar">
    <div class="brand">
      <span class="logo-hex" aria-hidden="true" title="Bjarnoy">
        <svg viewBox="0 0 100 100">
          <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
        </svg>
      </span>
      <div class="titles" v-if="settlementName">
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
</style>

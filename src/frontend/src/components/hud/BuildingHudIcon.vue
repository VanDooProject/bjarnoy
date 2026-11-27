<script setup lang="ts">
// The little pictograms of the building HUD's rows (12x12, `currentColor`).
import { computed } from 'vue';

export type BuildingHudIconName = 'up' | 'lock' | 'hammer' | 'crown' | 'shield' | 'star' | 'store' | 'premium';

const props = defineProps<{ name: BuildingHudIconName }>();

const GLYPHS: Record<BuildingHudIconName, { box: string; markup: string; filled?: boolean }> = {
  up: { box: '0 0 12 12', markup: '<path d="M6 10V2M2.5 5.5 6 2l3.5 3.5"/>' },
  lock: { box: '0 0 12 12', markup: '<rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor" stroke="none"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/>' },
  hammer: { box: '0 0 12 12', markup: '<path d="M3 10.5 7.5 6M5.5 2.5l3.5 3.5 1.5-1.5L7 1z"/>' },
  crown: { box: '0 0 12 12', markup: '<path d="M1.5 4 4 6l2-3.5L8 6l2.5-2-1 6h-7z"/>', filled: true },
  shield: { box: '0 0 12 12', markup: '<path d="M6 1 10.5 2.5V6c0 2.6-2 4.3-4.5 5C3.5 10.3 1.5 8.6 1.5 6V2.5z"/>', filled: true },
  star: { box: '0 0 12 12', markup: '<path d="m6 1 1.5 3.2 3.5.4-2.6 2.3.8 3.5L6 8.6 2.8 10.4l.8-3.5L1 4.6l3.5-.4z"/>', filled: true },
  store: { box: '0 0 12 12', markup: '<path d="M1.5 5 6 2l4.5 3v5h-9z"/><path d="M4 10V7h4v3"/>' },
  // A clock with a gem: "premium shows the time".
  premium: {
    box: '0 0 15 13',
    markup:
      '<circle cx="6" cy="6.5" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 4v2.7l1.6 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10.2 7.2h3.6l1 1.4-2.8 3.6-2.8-3.6z" fill="currentColor" stroke="#0e1a22" stroke-width=".9" stroke-linejoin="round"/>',
  },
};
const glyph = computed(() => GLYPHS[props.name]);
</script>

<template>
  <svg
    class="hud-icon"
    :class="{ 'hud-icon--filled': glyph.filled, 'hud-icon--premium': name === 'premium' }"
    :viewBox="glyph.box"
    aria-hidden="true"
    focusable="false"
    v-html="glyph.markup"
  />
</template>

<style scoped>
.hud-icon {
  width: 12px;
  height: 12px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hud-icon--filled {
  fill: currentColor;
  stroke: none;
}
.hud-icon--premium {
  width: 17px;
  height: 15px;
}
</style>

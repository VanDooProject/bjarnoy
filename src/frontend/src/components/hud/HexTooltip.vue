<script setup lang="ts">
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the hover half. Anchored to the hovered hex's
// screen position (from HexMapRenderer's onHoverChange), matching the
// mockup's card that follows the cursor over the settlement.
import { computed } from 'vue';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';

const props = defineProps<{ info: HoverInfo }>();

const style = computed(() => ({
  left: `${props.info.screenX}px`,
  top: `${props.info.screenY - 18}px`,
}));
</script>

<template>
  <div class="hex-tooltip panel" :style="style">
    <div class="head">
      <span class="title">{{ info.title }}</span>
      <span class="coord">{{ info.coord }}</span>
    </div>
    <div class="subtitle">{{ info.subtitle }}</div>
    <div v-if="info.stat" class="stat">{{ info.stat }}</div>
    <ul v-if="info.extra.length" class="extra">
      <li v-for="line in info.extra" :key="line">{{ line }}</li>
    </ul>
  </div>
</template>

<style scoped>
.hex-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  z-index: 20;
  padding: 10px 14px;
  min-width: 170px;
  pointer-events: none;
  /* issue #16 "better hover": "square edges" — overrides .panel's rounded
     corners, which is the shared style every other HUD chip/panel uses. */
  border-radius: 0;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.coord {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted-2);
  white-space: nowrap;
}
.subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
.stat {
  margin-top: 6px;
  font-size: 13px;
  color: var(--gold);
}
.extra {
  margin: 6px 0 0;
  padding: 6px 0 0;
  border-top: 1px solid var(--panel-border);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.extra li {
  font-size: 12px;
  color: var(--muted-2);
}
</style>

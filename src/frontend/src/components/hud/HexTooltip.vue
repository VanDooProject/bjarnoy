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
    <div class="title">{{ info.title }}</div>
    <div class="subtitle">{{ info.subtitle }}</div>
    <div v-if="info.stat" class="stat">{{ info.stat }}</div>
  </div>
</template>

<style scoped>
.hex-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  z-index: 20;
  padding: 10px 14px;
  min-width: 150px;
  pointer-events: none;
}
.title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
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
</style>

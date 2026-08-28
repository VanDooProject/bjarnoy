<script setup lang="ts">
// Issue #16 "better hover": "hover on tiles should have more info and
// square edges" — matches the mockup's "Crop farm LEVEL 2 / Output +240
// food/h / Irrigated yes (+10%) / Workers 8/8 / CLICK TO OPEN" card. The
// extra fields (output/modifier/workers/cta) are optional — non-building
// tiles just render title/subtitle/stat as before. See HoverInfo's doc
// comment in HexMapRenderer.ts for how those numbers are derived.
import { computed } from 'vue';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';

const props = defineProps<{ info: HoverInfo }>();

// screenX is already anchored at the hovered tile's own right edge
// (HexMapRenderer.hoverInfoFor), so only a small fixed margin is needed
// here — the tile-width offset itself lives in world space and scales
// with zoom on its own.
const style = computed(() => ({
  left: `${props.info.screenX + 12}px`,
  top: `${props.info.screenY}px`,
}));
</script>

<template>
  <div class="hex-tooltip panel" :style="style">
    <div class="title-row">
      <span class="title">{{ info.title }}</span>
      <span v-if="info.level" class="level">LEVEL {{ info.level }}</span>
    </div>
    <div class="subtitle">{{ info.subtitle }}</div>
    <div class="separator" />
    <div v-if="info.stat && !info.level" class="stat">{{ info.stat }}</div>
    <dl v-if="info.output || info.modifier || info.workers" class="stats">
      <template v-if="info.output">
        <dt>Output</dt>
        <dd>{{ info.output }}</dd>
      </template>
      <template v-if="info.modifier">
        <dt>Modifier</dt>
        <dd>{{ info.modifier }}</dd>
      </template>
      <template v-if="info.workers">
        <dt>Workers</dt>
        <dd>{{ info.workers }}</dd>
      </template>
    </dl>
    <div v-if="info.premiumLocked" class="premium-gate">
      <span class="lock">&#128274;</span>
      <span>Scouting details are a <strong>Premium</strong> feature</span>
    </div>
    <div v-if="info.cta" class="cta">{{ info.cta.toUpperCase() }}</div>
  </div>
</template>

<style scoped>
.hex-tooltip {
  position: absolute;
  transform: translate(0, -50%);
  z-index: 20;
  padding: 10px 14px;
  min-width: 170px;
  pointer-events: none;
  /* Issue #16: square, not rounded — .panel's own border-radius is
     overridden here rather than there, since other .panel HUD chrome
     (RealmPanel, BuildQueuePanel, etc.) is unaffected by this change. */
  border-radius: 0;
}
.title-row {
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
.level {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--gold);
}
.subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
.separator {
  margin-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.stat {
  margin-top: 6px;
  font-size: 13px;
  color: var(--gold);
}
.stats {
  margin: 8px 0 0;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 10px;
  row-gap: 2px;
  font-size: 12px;
}
.stats dt {
  color: var(--muted);
}
.stats dd {
  margin: 0;
  color: var(--text);
  font-weight: 500;
  text-align: right;
}
.cta {
  margin-top: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted-2, var(--muted));
  border-top: 1px solid var(--panel-border);
  padding-top: 6px;
}
.premium-gate {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}
.premium-gate strong {
  color: var(--gold);
  font-weight: 600;
}
.premium-gate .lock {
  font-size: 11px;
}
</style>

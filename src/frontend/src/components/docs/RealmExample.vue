<script setup lang="ts">
// The Extending the realm docs page's example map: a small island with the longhouse near its middle, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like WallExample.vue and LandMovementExample.vue). A step picker adds the towers one by
// one; every step re-claims the ground through the model itself (lib/docs/realmExample.ts), so the gold border is the real
// realm border the map draws round your own territory.
import { computed, ref, watch } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { REALM_EXAMPLE_PLAYER, REALM_EXAMPLE_STEPS, applyRealmExampleStep } from '../../lib/docs/realmExample';
import DocsPicker from './DocsPicker.vue';

const step = ref(0);
const world = new StaticWorldModel();
applyRealmExampleStep(world, step.value);

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

// useHexMapRenderer reads its options once, at mount: a later step goes through the same model's `setTiles` and the renderer's
// `forceRebuild`, as WastedIsland.vue does.
const { renderer } = useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: world,
  playerId: REALM_EXAMPLE_PLAYER,
  previewCenter: { q: 3, r: 0 },
  lockCamera: true,
  // Inline in a scrolling article: a wheel/touch gesture over the map scrolls the page (see WastedIsland.vue).
  allowPageScroll: true,
  hideSettlementBadge: true,
});

watch(step, (next) => {
  applyRealmExampleStep(world, next);
  renderer.value?.forceRebuild();
});

const options = computed(() =>
  REALM_EXAMPLE_STEPS.map((_, i) => ({ value: i, label: String(i + 1) })),
);
</script>

<template>
  <div class="realm-example" data-testid="realm-example">
    <div ref="container" class="map-host" role="img" :aria-label="$t('docs.realm.example.alt')">
      <canvas ref="canvas" />
    </div>
    <p class="caption" data-testid="realm-example-caption">{{ $t(`docs.realm.example.steps.${step + 1}`) }}</p>
    <DocsPicker v-model="step" :label="$t('docs.realm.example.step')" :options="options" />
  </div>
</template>

<style scoped>
.realm-example {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.map-host {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
  border: 1px solid var(--panel-border);
}
.map-host canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
  cursor: default;
}
.caption {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
  min-height: 3em;
}
</style>

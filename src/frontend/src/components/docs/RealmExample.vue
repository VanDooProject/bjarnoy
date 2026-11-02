<script setup lang="ts">
// The Extending the realm docs page's example map: a small island with the longhouse near its middle, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like WallExample.vue and LandMovementExample.vue). A step picker adds the towers one by
// one; every step re-claims the ground through the model itself (lib/docs/realmExample.ts), so the gold border is the real
// realm border the map draws round your own territory.
import { ref, watch } from 'vue';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { REALM_EXAMPLE_PLAYER, REALM_EXAMPLE_STEPS, applyRealmExampleStep } from '../../lib/docs/realmExample';

const step = ref(0);
const world = new StaticWorldModel();
applyRealmExampleStep(world, step.value);

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

// useHexMapRenderer reads its options once, at mount: a later step goes through the same model's `setTiles` and the renderer's
// `forceRebuild`, as WastedIsland.vue does.
const { renderer } = useDocsMapRenderer(canvas, container, {
  worldModel: world,
  playerId: REALM_EXAMPLE_PLAYER,
  previewCenter: { q: 3, r: 0 },
});

watch(step, (next) => {
  applyRealmExampleStep(world, next);
  renderer.value?.forceRebuild();
});

const lastStep = REALM_EXAMPLE_STEPS.length - 1;
</script>

<template>
  <div class="realm-example" data-testid="realm-example">
    <div ref="container" class="map-host" role="img" :aria-label="$t('docs.realm.example.alt')">
      <canvas ref="canvas" class="docs-map-canvas" />
    </div>
    <p class="caption" data-testid="realm-example-caption">{{ $t(`docs.realm.example.steps.${step + 1}`) }}</p>
    <label class="step-slider">
      <span class="step-label">{{ $t('docs.realm.example.step') }} {{ step + 1 }} / {{ lastStep + 1 }}</span>
      <input v-model.number="step" type="range" min="0" :max="lastStep" step="1" data-testid="realm-example-slider" />
    </label>
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
.caption {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
  min-height: 3em;
}
.step-slider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.step-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.step-slider input {
  flex: 1;
  min-width: 0;
  accent-color: var(--gold);
}
</style>

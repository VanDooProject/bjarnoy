<script setup lang="ts">
// A backend-free playground for the island-shape generation parameters
// (issue: "still look quite round" feedback on the multi-lobe rewrite).
// worldGenerator.ts is a pure TS mirror of the backend's TerrainSampler, so
// every variant card below renders straight from a seed + parameter set with
// no API call — this is what makes a live, multi-variant compare possible.
import { nextTick, reactive } from 'vue';
import { DEFAULT_GENERATION, terrainAt, type WorldGenerationConstants, type WorldSeed } from '../../lib/map/worldGenerator';
import { oddQToAxial } from '../../lib/hex/coords';
import type { Terrain } from '../../lib/map/types';

interface Variant {
  id: number;
  seedInput: string;
  generation: WorldGenerationConstants;
}

/** Order the form renders in, plus each field's i18n label key and `<input>` constraints — mirrors AdminWorldReseedView's GENERATION_FIELDS, extended with the two lobe-scale fields worldGenerator.ts also exposes. */
const GENERATION_FIELDS: {
  key: keyof WorldGenerationConstants;
  labelKey: string;
  min: number;
  max?: number;
  step: number;
}[] = [
  { key: 'islandCellSize', labelKey: 'islandCellSizeLabel', min: 2, step: 1 },
  { key: 'islandChance', labelKey: 'islandChanceLabel', min: 0.01, max: 1, step: 0.01 },
  { key: 'islandMinRadius', labelKey: 'islandMinRadiusLabel', min: 0.1, step: 0.1 },
  { key: 'islandMaxRadius', labelKey: 'islandMaxRadiusLabel', min: 0.1, step: 0.1 },
  { key: 'islandMinLobes', labelKey: 'islandMinLobesLabel', min: 1, max: 5, step: 1 },
  { key: 'islandMaxLobes', labelKey: 'islandMaxLobesLabel', min: 1, max: 5, step: 1 },
  { key: 'islandMaxElongation', labelKey: 'islandMaxElongationLabel', min: 0, max: 1.5, step: 0.05 },
  { key: 'islandBendiness', labelKey: 'islandBendinessLabel', min: 0, max: 3, step: 0.1 },
  { key: 'islandLobeBlend', labelKey: 'islandLobeBlendLabel', min: 0, max: 0.5, step: 0.01 },
  { key: 'islandLobeMinScale', labelKey: 'islandLobeMinScaleLabel', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'islandLobeMaxScale', labelKey: 'islandLobeMaxScaleLabel', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'islandCoastWarp', labelKey: 'islandCoastWarpLabel', min: 0, max: 4, step: 0.1 },
  { key: 'islandCoastWarpScale', labelKey: 'islandCoastWarpScaleLabel', min: 2, max: 12, step: 0.5 },
  { key: 'beachThreshold', labelKey: 'beachThresholdLabel', min: 0, max: 1, step: 0.01 },
  { key: 'mountainThreshold', labelKey: 'mountainThresholdLabel', min: 0, max: 1, step: 0.01 },
  { key: 'mountainRockiness', labelKey: 'mountainRockinessLabel', min: 0, max: 1, step: 0.01 },
  { key: 'forestRockiness', labelKey: 'forestRockinessLabel', min: 0, max: 1, step: 0.01 },
];

// Odd-q columns/rows from -GRID_RADIUS..GRID_RADIUS, one square dot per hex —
// same dot-minimap style as the OLD/NEW comparison screenshots, just driven
// live instead of pre-rendered.
const GRID_RADIUS = 40;
const DOT_SIZE = 4;
const CANVAS_SIZE = (GRID_RADIUS * 2 + 1) * DOT_SIZE;

const TERRAIN_COLORS: Record<Terrain, string> = {
  sea: '#1c3b52',
  sand: '#d8c184',
  grass: '#4c7a3f',
  forest: '#2e5730',
  mountain: '#7c7466',
};

/** A seed the backend would accept: a non-negative signed-32-bit integer. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

let nextId = 1;
function newVariant(seed: number, generation: WorldGenerationConstants = { ...DEFAULT_GENERATION }): Variant {
  return { id: nextId++, seedInput: String(seed), generation };
}

// Defaults to exactly the two seeds already compared by eye (2147483 read as
// still-too-round, 42 read as "not that bad") so the page opens already
// showing the disagreement it exists to help resolve.
const variants = reactive<Variant[]>([newVariant(2147483), newVariant(42)]);

const canvasRefs = new Map<number, HTMLCanvasElement>();
function setCanvasRef(id: number, el: Element | null) {
  if (el instanceof HTMLCanvasElement) canvasRefs.set(id, el);
  else canvasRefs.delete(id);
}

function draw(variant: Variant) {
  const canvas = canvasRefs.get(variant.id);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const seedValue = Number(variant.seedInput);
  const world: WorldSeed = { seed: Number.isInteger(seedValue) ? seedValue : 0, generation: variant.generation };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let col = -GRID_RADIUS; col <= GRID_RADIUS; col++) {
    for (let row = -GRID_RADIUS; row <= GRID_RADIUS; row++) {
      const { q, r } = oddQToAxial({ col, row });
      ctx.fillStyle = TERRAIN_COLORS[terrainAt(q, r, world)];
      ctx.fillRect((col + GRID_RADIUS) * DOT_SIZE, (row + GRID_RADIUS) * DOT_SIZE, DOT_SIZE, DOT_SIZE);
    }
  }
}

function redrawAll() {
  for (const variant of variants) draw(variant);
}

async function addVariant() {
  variants.push(newVariant(randomSeed()));
  await nextTick();
  draw(variants[variants.length - 1]);
}

async function duplicateVariant(variant: Variant) {
  variants.push(newVariant(Number(variant.seedInput) || 0, { ...variant.generation }));
  await nextTick();
  draw(variants[variants.length - 1]);
}

function removeVariant(id: number) {
  const index = variants.findIndex((v) => v.id === id);
  if (index >= 0) variants.splice(index, 1);
  canvasRefs.delete(id);
}

function randomizeSeed(variant: Variant) {
  variant.seedInput = String(randomSeed());
  draw(variant);
}

function resetToDefault(variant: Variant) {
  variant.generation = { ...DEFAULT_GENERATION };
  draw(variant);
}

// Canvas refs are already attached by the time onMounted would fire (the
// v-for's :ref callbacks run during this component's own initial render),
// so drawing straight after the template renders — via nextTick, not
// onMounted — is what actually has something to draw into for every variant,
// including ones added later by addVariant/duplicateVariant above.
void nextTick(redrawAll);
</script>

<template>
  <div class="island-lab">
    <header class="head">
      <h1>{{ $t('adminIslandLab.heading') }}</h1>
      <button class="secondary" data-testid="add-variant" @click="addVariant">
        {{ $t('adminIslandLab.addVariant') }}
      </button>
    </header>
    <p class="hint">{{ $t('adminIslandLab.hint') }}</p>

    <div class="variants">
      <section v-for="variant in variants" :key="variant.id" class="panel variant" data-testid="island-lab-variant">
        <div class="controls">
          <label :for="`lab-seed-${variant.id}`">{{ $t('adminIslandLab.seedLabel') }}</label>
          <input
            :id="`lab-seed-${variant.id}`"
            v-model="variant.seedInput"
            type="number"
            step="1"
            @change="draw(variant)"
          />
          <button class="secondary" data-testid="randomize-seed" @click="randomizeSeed(variant)">
            {{ $t('adminIslandLab.randomizeSeed') }}
          </button>
          <button class="secondary" data-testid="duplicate-variant" @click="duplicateVariant(variant)">
            {{ $t('adminIslandLab.duplicate') }}
          </button>
          <button
            class="destructive"
            data-testid="remove-variant"
            :disabled="variants.length <= 1"
            @click="removeVariant(variant.id)"
          >
            {{ $t('adminIslandLab.remove') }}
          </button>
        </div>

        <canvas
          :ref="(el) => setCanvasRef(variant.id, el as Element | null)"
          class="minimap"
          data-testid="island-lab-canvas"
          :width="CANVAS_SIZE"
          :height="CANVAS_SIZE"
        />

        <div class="generation-grid">
          <div v-for="field in GENERATION_FIELDS" :key="field.key" class="generation-field">
            <label :for="`lab-gen-${variant.id}-${field.key}`">{{ $t(`adminIslandLab.${field.labelKey}`) }}</label>
            <input
              :id="`lab-gen-${variant.id}-${field.key}`"
              v-model.number="variant.generation[field.key]"
              type="number"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :data-testid="`lab-gen-${variant.id}-${field.key}`"
              @input="draw(variant)"
            />
          </div>
        </div>
        <button class="secondary" data-testid="reset-generation" @click="resetToDefault(variant)">
          {{ $t('adminIslandLab.resetToDefault') }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.island-lab h1 {
  margin: 0 0 16px;
}
.hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted);
  max-width: 80ch;
}
.variants {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  align-items: start;
}
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 16px 20px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.controls label {
  font-size: 13px;
  color: var(--muted);
}
.controls input {
  width: 110px;
}
.minimap {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  margin-bottom: 12px;
  image-rendering: pixelated;
}
.generation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.generation-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.generation-field label {
  font-size: 11px;
  color: var(--muted);
}
.generation-field input {
  width: 100%;
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button.secondary {
  background: none;
  border: 1px solid var(--panel-border);
  color: var(--text);
}
button.destructive {
  background: var(--rival);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

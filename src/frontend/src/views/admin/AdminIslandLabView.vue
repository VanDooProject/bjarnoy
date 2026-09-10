<script setup lang="ts">
// A backend-free playground for the island-shape generation parameters
// (issue: "still look quite round" feedback on the multi-lobe rewrite).
// worldGenerator.ts is a pure TS mirror of the backend's TerrainSampler, so
// every variant card below renders straight from a seed + parameter set with
// no API call — this is what makes a live, multi-variant compare possible.
import { nextTick, reactive, ref } from 'vue';
import { DEFAULT_GENERATION, terrainAt, type WorldGenerationConstants, type WorldSeed } from '../../lib/map/worldGenerator';
import { oddQToAxial } from '../../lib/hex/coords';
import type { Terrain } from '../../lib/map/types';

interface Viewport {
  /** Odd-q column/row the view is centred on. */
  centerCol: number;
  centerRow: number;
  /** Hex-dots-per-pixel zoom; 1 = the whole GRID_RADIUS square fits the canvas. */
  zoom: number;
}

interface Variant {
  id: number;
  seedInput: string;
  generation: WorldGenerationConstants;
  viewport: Viewport;
}

/** The two presets the docs section's buttons write into a chosen variant. */
const PRESETS: { key: string; labelKey: string; generation: WorldGenerationConstants }[] = [
  {
    key: 'baseline',
    labelKey: 'presetBaseline',
    generation: {
      ...DEFAULT_GENERATION,
      islandCellSize: 23,
      islandMinRadius: 5.5,
      islandMaxRadius: 12.9,
      islandMinLobes: 2,
      islandMaxLobes: 4,
      islandMaxElongation: 1.0,
      islandBendiness: 1.6,
      islandLobeBlend: 0.25,
      islandLobeMinScale: 0.55,
      islandLobeMaxScale: 0.85,
      islandCoastWarp: 1.5,
      islandCoastWarpScale: 5.0,
    },
  },
  { key: 'recommended', labelKey: 'presetRecommended', generation: { ...DEFAULT_GENERATION } },
];

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
  { key: 'islandMinLobes', labelKey: 'islandMinLobesLabel', min: 1, max: 8, step: 1 },
  { key: 'islandMaxLobes', labelKey: 'islandMaxLobesLabel', min: 1, max: 8, step: 1 },
  { key: 'islandMaxElongation', labelKey: 'islandMaxElongationLabel', min: 0, max: 4, step: 0.05 },
  { key: 'islandBendiness', labelKey: 'islandBendinessLabel', min: 0, max: 3, step: 0.1 },
  { key: 'islandLobeBlend', labelKey: 'islandLobeBlendLabel', min: 0, max: 0.5, step: 0.01 },
  { key: 'islandLobeMinScale', labelKey: 'islandLobeMinScaleLabel', min: 0.3, max: 1.0, step: 0.02 },
  { key: 'islandLobeMaxScale', labelKey: 'islandLobeMaxScaleLabel', min: 0.3, max: 1.0, step: 0.02 },
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

function defaultViewport(): Viewport {
  return { centerCol: 0, centerRow: 0, zoom: 1 };
}

let nextId = 1;
function newVariant(seed: number, generation: WorldGenerationConstants = { ...DEFAULT_GENERATION }): Variant {
  return { id: nextId++, seedInput: String(seed), generation, viewport: defaultViewport() };
}

// Defaults to exactly the two seeds already compared by eye (2147483 read as
// still-too-round, 42 read as "not that bad") so the page opens already
// showing the disagreement it exists to help resolve.
const variants = reactive<Variant[]>([newVariant(2147483), newVariant(42)]);

const docsOpen = ref(false);
/** Which variant a preset button writes into when more than one is open. */
const presetTarget = ref<number>(variants[0].id);
/** Mirrors every canvas's pan/zoom onto every other variant's when true. */
const syncViewports = ref(false);

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
  const { centerCol, centerRow, zoom } = variant.viewport;
  const dotSize = DOT_SIZE * zoom;
  const half = CANVAS_SIZE / dotSize / 2;
  const minCol = Math.floor(centerCol - half) - 1;
  const maxCol = Math.ceil(centerCol + half) + 1;
  const minRow = Math.floor(centerRow - half) - 1;
  const maxRow = Math.ceil(centerRow + half) + 1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const { q, r } = oddQToAxial({ col, row });
      const px = (col - (centerCol - half)) * dotSize;
      const py = (row - (centerRow - half)) * dotSize;
      ctx.fillStyle = TERRAIN_COLORS[terrainAt(q, r, world)];
      ctx.fillRect(px, py, dotSize, dotSize);
    }
  }
}

function redrawAll() {
  for (const variant of variants) draw(variant);
}

/** Draws `variant`, then mirrors its viewport onto every other one when sync is on. */
function applyViewport(variant: Variant) {
  draw(variant);
  if (!syncViewports.value) return;
  for (const other of variants) {
    if (other.id === variant.id) continue;
    other.viewport.centerCol = variant.viewport.centerCol;
    other.viewport.centerRow = variant.viewport.centerRow;
    other.viewport.zoom = variant.viewport.zoom;
    draw(other);
  }
}

function resetView(variant: Variant) {
  variant.viewport = defaultViewport();
  applyViewport(variant);
}

async function addVariant() {
  const variant = newVariant(randomSeed());
  if (syncViewports.value && variants.length > 0) variant.viewport = { ...variants[0].viewport };
  variants.push(variant);
  await nextTick();
  draw(variant);
}

async function duplicateVariant(variant: Variant) {
  const copy = newVariant(Number(variant.seedInput) || 0, { ...variant.generation });
  copy.viewport = { ...variant.viewport };
  variants.push(copy);
  await nextTick();
  draw(copy);
}

function removeVariant(id: number) {
  const index = variants.findIndex((v) => v.id === id);
  if (index >= 0) variants.splice(index, 1);
  canvasRefs.delete(id);
  pointerDrags.delete(id);
  if (presetTarget.value === id && variants.length > 0) presetTarget.value = variants[0].id;
}

function randomizeSeed(variant: Variant) {
  variant.seedInput = String(randomSeed());
  draw(variant);
}

/**
 * The variant a preset button (or anything else offering a single-target
 * write) should apply to: the explicitly picked one if it's still open,
 * otherwise the first variant — so a single-variant page never needs the
 * target selector to be visible at all.
 */
function resolvePresetTarget(): Variant | undefined {
  return variants.find((v) => v.id === presetTarget.value) ?? variants[0];
}

function applyPreset(preset: (typeof PRESETS)[number]) {
  const variant = resolvePresetTarget();
  if (!variant) return;
  variant.generation = { ...preset.generation };
  draw(variant);
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Converts a canvas-relative CSS pixel to the col/row it currently shows. */
function pixelToGrid(variant: Variant, px: number, py: number): { col: number; row: number } {
  const { centerCol, centerRow, zoom } = variant.viewport;
  const dotSize = DOT_SIZE * zoom;
  const half = CANVAS_SIZE / dotSize / 2;
  return { col: centerCol - half + px / dotSize, row: centerRow - half + py / dotSize };
}

/** Canvas-relative CSS pixel coordinates for a pointer event, accounting for the canvas's own CSS scaling. */
function eventToCanvasPixel(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
}

function onWheel(event: WheelEvent, variant: Variant) {
  event.preventDefault();
  const canvas = canvasRefs.get(variant.id);
  if (!canvas) return;

  const { x, y } = eventToCanvasPixel(canvas, event);
  const before = pixelToGrid(variant, x, y);
  const zoomFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  variant.viewport.zoom = clampZoom(variant.viewport.zoom * zoomFactor);
  const after = pixelToGrid(variant, x, y);
  // Keep the hex under the cursor fixed in place rather than zooming on centre.
  variant.viewport.centerCol += before.col - after.col;
  variant.viewport.centerRow += before.row - after.row;
  applyViewport(variant);
}

interface Drag {
  startClientX: number;
  startClientY: number;
  startCenterCol: number;
  startCenterRow: number;
}

const pointerDrags = new Map<number, Drag>();

function onPointerDown(event: PointerEvent, variant: Variant) {
  const canvas = canvasRefs.get(variant.id);
  if (!canvas) return;
  canvas.setPointerCapture(event.pointerId);
  pointerDrags.set(variant.id, {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startCenterCol: variant.viewport.centerCol,
    startCenterRow: variant.viewport.centerRow,
  });
}

function onPointerMove(event: PointerEvent, variant: Variant) {
  const drag = pointerDrags.get(variant.id);
  const canvas = canvasRefs.get(variant.id);
  if (!drag || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const dotSize = DOT_SIZE * variant.viewport.zoom;
  const dxCols = ((event.clientX - drag.startClientX) * scale) / dotSize;
  const dyRows = ((event.clientY - drag.startClientY) * scale) / dotSize;
  variant.viewport.centerCol = drag.startCenterCol - dxCols;
  variant.viewport.centerRow = drag.startCenterRow - dyRows;
  applyViewport(variant);
}

function onPointerUp(event: PointerEvent, variant: Variant) {
  const canvas = canvasRefs.get(variant.id);
  if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  pointerDrags.delete(variant.id);
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

    <section class="panel docs">
      <button class="secondary docs-toggle" :class="{ open: docsOpen }" data-testid="docs-toggle" @click="docsOpen = !docsOpen">
        {{ $t('adminIslandLab.docsToggle') }}
        <span class="docs-toggle-caret" aria-hidden="true" />
      </button>
      <div v-if="docsOpen" class="docs-body" data-testid="docs-body">
        <p>{{ $t('adminIslandLab.docsIntro') }}</p>
        <p>{{ $t('adminIslandLab.docsFields') }}</p>
        <p>{{ $t('adminIslandLab.docsBudget') }}</p>
      </div>

      <div class="presets">
        <span class="presets-label">{{ $t('adminIslandLab.presetsLabel') }}</span>
        <button
          v-for="preset in PRESETS"
          :key="preset.key"
          class="secondary"
          :data-testid="`preset-${preset.key}`"
          @click="applyPreset(preset)"
        >
          {{ $t(`adminIslandLab.${preset.labelKey}`) }}
        </button>
        <template v-if="variants.length > 1">
          <label for="preset-target">{{ $t('adminIslandLab.presetTargetLabel') }}</label>
          <select id="preset-target" v-model.number="presetTarget" data-testid="preset-target">
            <option v-for="(variant, index) in variants" :key="variant.id" :value="variant.id">
              {{ $t('adminIslandLab.variantOptionLabel', { n: index + 1, seed: variant.seedInput }) }}
            </option>
          </select>
        </template>
      </div>

      <label class="sync-toggle">
        <input v-model="syncViewports" type="checkbox" data-testid="sync-viewports" />
        {{ $t('adminIslandLab.syncViewports') }}
      </label>
    </section>

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
          <button class="secondary" data-testid="reset-view" @click="resetView(variant)">
            {{ $t('adminIslandLab.resetView') }}
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
          @wheel="onWheel($event, variant)"
          @pointerdown="onPointerDown($event, variant)"
          @pointermove="onPointerMove($event, variant)"
          @pointerup="onPointerUp($event, variant)"
          @pointercancel="onPointerUp($event, variant)"
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
.docs {
  margin-bottom: 16px;
}
.docs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.docs-toggle-caret {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
  transition: transform 0.15s ease;
}
.docs-toggle.open .docs-toggle-caret {
  transform: rotate(180deg);
}
.docs-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  max-width: 90ch;
}
.presets {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.presets-label {
  font-size: 13px;
  color: var(--muted);
}
.sync-toggle {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
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
  cursor: grab;
  touch-action: none;
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

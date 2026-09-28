<script setup lang="ts">
// The Wasted Lands docs page's "turning island": a made-up island (see
// wastedIsland.ts for the data it renders) whose hexes cross-fade from their
// living art to their wasted counterpart as the blight slider advances.
//
// Draws with the game's own HexMapRenderer (via StaticWorldModel), fed a
// fixed Tile[] from buildIslandTiles — the same terrainBase -> hover ->
// terrainTop draw order and the same textures.ts/giantTiles.ts art lookups a
// real in-game island uses, rather than this component's own hand-positioned
// DOM sprites (what it used before). That's also why the hover wash now sits
// correctly *under* a giant's top parts instead of drawn over them: it's the
// exact same hover layer the game itself draws between the two terrain
// layers, not a separate SVG overlay guessing at stacking order.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import type { AxialCoord } from '../../lib/hex/coords';
import { buildIslandTiles, delayFraction, islandHexInfo, type IslandKind } from '../../lib/docs/wastedIsland';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const stage = ref(4);
const rotation = ref(0);
const playing = ref(false);
let playTimer: ReturnType<typeof setInterval> | null = null;

const reducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// useHexMapRenderer reads its options once, non-reactively, at mount (see
// SettlementCanvas.vue's matching comment) — every later change (the blight
// slider, the rotate buttons) instead goes through this same model's own
// `setTiles` plus the exposed renderer's `forceRebuild`, the way the real
// game mutates its WorldModel and re-renders rather than re-mounting.
const world = new StaticWorldModel(buildIslandTiles(rotation.value, stage.value));

// The hovered hex, plus which rotation it was hovered *at* — a hex's
// identity (kind/turnsAt) is looked up per-rotation (islandHexInfo), and the
// rotate buttons don't themselves fire a new hover event, so without this a
// post-rotation lookup against a pre-rotation coordinate could resolve to
// the wrong (or no) hex until the pointer next moves.
const hovered = ref<{ coord: AxialCoord; rotation: number } | null>(null);

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { renderer } = useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: world,
  playerId: 'docs',
  previewCenter: { q: 0, r: 0 },
  lockCamera: true,
  // The locked preview sits inline in this scrolling docs article, not
  // beside static hero copy the way the landing page's own locked preview
  // does — a wheel/touch gesture over it should scroll the page, not be
  // eaten for a zoom/pan the locked camera already ignores anyway. The
  // canvas's own `touch-action: pan-y` (below) is this same intent from the
  // CSS side.
  allowPageScroll: true,
  hideSettlementBadge: true,
  onHoverChange: (info: HoverInfo | null) => {
    hovered.value = info ? { coord: info.coord, rotation: rotation.value } : null;
  },
});

function tileNameKey(kind: IslandKind, turned: boolean): string {
  if (kind === 'utgard') return turned ? 'wastedLands.island.giantWasted' : 'wastedLands.island.giantLiving';
  if (kind === 'volcano') return turned ? 'wastedLands.island.giantVolcano' : 'wastedLands.island.giantMountainLiving';
  return `wastedLands.tiles.${kind}.${turned ? 'wasted' : 'living'}`;
}

const captionText = computed(() => {
  const h = hovered.value;
  const info = h ? islandHexInfo(h.rotation, h.coord) : undefined;
  if (!info) return t('docs.wastedLands.island.hoverHint');
  return t(tileNameKey(info.kind, stage.value >= info.turnsAt));
});

// The blight slider (and `togglePlay`'s own steps through it) rebuilds the
// whole island for the new stage and cross-fades the swap — mirrors the old
// DOM version's CSS transition (700ms, staggered by `delay * 400ms` per hex,
// ring by ring from the centre out).
watch(stage, (newStage) => {
  world.setTiles(buildIslandTiles(rotation.value, newStage));
  renderer.value?.forceRebuild({
    transition: {
      durationMs: reducedMotion ? 0 : 700,
      delayMs: (c) => (reducedMotion ? 0 : delayFraction(rotation.value, c) * 400),
    },
  });
});

function rotate(delta: number): void {
  rotation.value = (((rotation.value + delta) % 6) + 6) % 6;
  world.setTiles(buildIslandTiles(rotation.value, stage.value));
  // No transition here: a rotation swaps every hex's screen position, not
  // just its texture — a cross-fade would read as every tile's art
  // dissolving in place while the whole island silently jumps underneath it,
  // not as the island actually turning.
  renderer.value?.forceRebuild();
}

function togglePlay(): void {
  if (playing.value) {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    playing.value = false;
    return;
  }
  playing.value = true;
  stage.value = 0;
  playTimer = setInterval(() => {
    if (stage.value >= 4) {
      if (playTimer) clearInterval(playTimer);
      playTimer = null;
      playing.value = false;
      return;
    }
    stage.value += 1;
  }, 1400);
}

onBeforeUnmount(() => {
  if (playTimer) clearInterval(playTimer);
});
</script>

<template>
  <div class="wasted-island">
    <div class="controls">
      <label class="slider-row">
        <span class="slider-label">{{ $t('docs.wastedLands.island.blight') }}</span>
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          v-model.number="stage"
          data-testid="blight-slider"
          :aria-label="$t('docs.wastedLands.island.blight')"
        />
        <span class="stage-label">{{ t(`docs.wastedLands.island.stages.s${stage}`) }}</span>
      </label>
      <div class="buttons">
        <button type="button" class="play-button" @click="togglePlay">
          {{ $t('docs.wastedLands.island.play') }}
        </button>
        <button
          type="button"
          class="rotate-button"
          :aria-label="$t('docs.wastedLands.island.rotateLeft')"
          @click="rotate(-1)"
        >
          ⟲
        </button>
        <button
          type="button"
          class="rotate-button"
          :aria-label="$t('docs.wastedLands.island.rotateRight')"
          @click="rotate(1)"
        >
          ⟳
        </button>
      </div>
    </div>

    <div ref="container" class="map-host">
      <canvas ref="canvas" />
    </div>

    <p class="caption" data-testid="island-caption">{{ captionText }}</p>
  </div>
</template>

<style scoped>
.wasted-island {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 260px;
}
.slider-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.slider-row input[type='range'] {
  flex: 1;
  min-width: 100px;
}
.stage-label {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.play-button,
.rotate-button {
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.rotate-button {
  padding: 6px 10px;
  font-size: 16px;
  line-height: 1;
}
.play-button:hover,
.rotate-button:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.map-host {
  position: relative;
  width: 100%;
  /* Fits the island (a radius-5 hex disc plus its two giants) without an
     awkward letterboxed strip either side — tuned against a screenshot,
     adjust here if a future art/layout change changes the island's own
     aspect ratio. */
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
  border: 1px solid var(--panel-border);
}
.map-host canvas {
  display: block;
  width: 100%;
  height: 100%;
  /* This preview's camera is locked (no pan/pinch-zoom) and `allowPageScroll`
     tells the renderer not to eat a wheel/touch gesture for zoom either — this
     is that same intent for the browser's own default touch handling, so a
     one-finger drag here scrolls the article instead of doing nothing.
     (SettlementCanvas.vue's real, pannable map uses `touch-action: none`
     instead — the opposite tradeoff, for the opposite reason.) */
  touch-action: pan-y;
  cursor: default;
}
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1.4em;
}
</style>

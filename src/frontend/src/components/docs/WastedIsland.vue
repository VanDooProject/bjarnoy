<script setup lang="ts">
// The Wasted Lands docs page's "turning island": a made-up island (see
// wastedIsland.ts for the data it renders) whose hexes cross-fade from their
// living art to their wasted counterpart as the blight slider advances.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import type { MessageSchema } from "../../i18n/schema";
import { atlasBackgroundStyle } from "../../lib/map/atlas";
import { isoTopPoints, isoGridPosition } from "../../lib/hex/geometry";
import {
  buildIsland,
  resolveIslandFrame,
  type IslandPlacement,
} from "../../lib/docs/wastedIsland";

const { t } = useI18n<{ message: MessageSchema }>({ useScope: "global" });

const TILE_W = 400;
const TOP_FACE_H = 184;

const stage = ref(4);
const rotation = ref(0);
const playing = ref(false);
const hoveredKey = ref<string | null>(null);
let playTimer: ReturnType<typeof setInterval> | null = null;

const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const placements = computed(() => buildIsland(rotation.value));

interface SpriteBox {
  left: number;
  top: number;
  width: number;
  height: number;
  style: ReturnType<typeof atlasBackgroundStyle>;
}

interface ResolvedPlacement {
  placement: IslandPlacement;
  living: SpriteBox | null;
  wasted: SpriteBox | null;
}

function spriteBox(p: IslandPlacement, frameName: string): SpriteBox | null {
  const rect = resolveIslandFrame(frameName);
  if (!rect) return null;
  return {
    left: p.x + rect.spriteSourceSize.x,
    top: p.y + rect.spriteSourceSize.y,
    width: rect.frame.w,
    height: rect.frame.h,
    style: atlasBackgroundStyle(rect),
  };
}

const resolved = computed<ResolvedPlacement[]>(() =>
  placements.value.map((placement) => ({
    placement,
    living: spriteBox(placement, placement.livingFrame),
    wasted: spriteBox(placement, placement.wastedFrame),
  })),
);

interface HexPoly {
  key: string;
  placementKey: string;
  points: string;
}

const hexPolygons = computed<HexPoly[]>(() => {
  const polys: HexPoly[] = [];
  for (const p of placements.value) {
    for (const hex of p.hexes) {
      const g = isoGridPosition(hex, TILE_W, TOP_FACE_H);
      const points = isoTopPoints(TILE_W, TOP_FACE_H)
        .map((pt) => `${pt.x + g.x},${pt.y + g.y}`)
        .join(" ");
      polys.push({ key: `${hex.q},${hex.r}`, placementKey: p.key, points });
    }
  }
  return polys;
});

const bounds = computed(() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const r of resolved.value) {
    if (r.living) {
      grow(r.living.left, r.living.top);
      grow(r.living.left + r.living.width, r.living.top + r.living.height);
    }
    if (r.wasted) {
      grow(r.wasted.left, r.wasted.top);
      grow(r.wasted.left + r.wasted.width, r.wasted.top + r.wasted.height);
    }
  }
  for (const poly of hexPolygons.value) {
    for (const pair of poly.points.split(" ")) {
      const [x, y] = pair.split(",").map(Number);
      grow(x!, y!);
    }
  }
  if (!Number.isFinite(minX))
    return { minX: 0, minY: 0, width: TILE_W, height: TOP_FACE_H };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
});

function shift(box: SpriteBox): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const b = bounds.value;
  return {
    left: box.left - b.minX,
    top: box.top - b.minY,
    width: box.width,
    height: box.height,
  };
}

function shiftedPolygonPoints(points: string): string {
  const b = bounds.value;
  return points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${x! - b.minX},${y! - b.minY}`;
    })
    .join(" ");
}

function spriteStyle(box: SpriteBox, turned: boolean, delay: number) {
  const s = shift(box);
  return {
    ...box.style,
    position: "absolute" as const,
    left: `${s.left}px`,
    top: `${s.top}px`,
    width: `${s.width}px`,
    height: `${s.height}px`,
    opacity: turned ? 1 : 0,
    transitionDuration: reducedMotion ? "0ms" : "700ms",
    transitionDelay: reducedMotion ? "0ms" : `${delay * 400}ms`,
  };
}

// --- Responsive scale -------------------------------------------------

const stageEl = shallowRef<HTMLElement | null>(null);
const containerWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (stageEl.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) containerWidth.value = entry.contentRect.width;
    });
    resizeObserver.observe(stageEl.value);
    containerWidth.value = stageEl.value.clientWidth;
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (playTimer) clearInterval(playTimer);
});

const scale = computed(() => {
  const w = bounds.value.width || 1;
  if (!containerWidth.value) return 1;
  return containerWidth.value / w;
});

const stageHeight = computed(() => bounds.value.height * scale.value);

// --- Hover / caption ----------------------------------------------------

const hoveredPlacement = computed(
  () => placements.value.find((p) => p.key === hoveredKey.value) ?? null,
);

function onEnterHex(placementKey: string): void {
  hoveredKey.value = placementKey;
}
function onLeaveHex(): void {
  hoveredKey.value = null;
}

function tileNameKey(p: IslandPlacement, turned: boolean): string {
  if (p.kind === "utgard")
    return turned
      ? "wastedLands.island.giantWasted"
      : "wastedLands.island.giantLiving";
  if (p.kind === "volcano")
    return turned
      ? "wastedLands.island.giantVolcano"
      : "wastedLands.island.giantMountainLiving";
  return `wastedLands.tiles.${p.kind}.${turned ? "wasted" : "living"}`;
}

const captionText = computed(() => {
  const p = hoveredPlacement.value;
  if (!p) return t("docs.wastedLands.island.hoverHint");
  return t(tileNameKey(p, stage.value >= p.turnsAt));
});

// --- Controls -------------------------------------------------------

function rotate(delta: number): void {
  rotation.value = (((rotation.value + delta) % 6) + 6) % 6;
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
</script>

<template>
  <div class="wasted-island">
    <div class="controls">
      <label class="slider-row">
        <span class="slider-label">{{
          $t("docs.wastedLands.island.blight")
        }}</span>
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          v-model.number="stage"
          data-testid="blight-slider"
          :aria-label="$t('docs.wastedLands.island.blight')"
        />
        <span class="stage-label">{{
          t(`docs.wastedLands.island.stages.s${stage}`)
        }}</span>
      </label>
      <div class="buttons">
        <button type="button" class="play-button" @click="togglePlay">
          {{ $t("docs.wastedLands.island.play") }}
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

    <div class="stage" ref="stageEl" :style="{ height: `${stageHeight}px` }">
      <div
        class="world"
        :style="{
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
          transform: `scale(${scale})`,
        }"
      >
        <template v-for="r in resolved" :key="r.placement.key">
          <div
            v-if="r.living"
            class="island-sprite"
            :style="
              spriteStyle(
                r.living,
                stage < r.placement.turnsAt,
                r.placement.delay,
              )
            "
          />
          <div
            v-if="r.wasted"
            class="island-sprite"
            :style="
              spriteStyle(
                r.wasted,
                stage >= r.placement.turnsAt,
                r.placement.delay,
              )
            "
          />
        </template>
        <svg class="overlay" :width="bounds.width" :height="bounds.height">
          <polygon
            v-for="poly in hexPolygons"
            :key="poly.key"
            :points="shiftedPolygonPoints(poly.points)"
            class="hex-hit"
            :class="{ hovered: poly.placementKey === hoveredKey }"
            @mouseenter="onEnterHex(poly.placementKey)"
            @mouseleave="onLeaveHex"
          />
        </svg>
      </div>
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
.slider-row input[type="range"] {
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
.stage {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
  border: 1px solid var(--panel-border);
}
.world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
.island-sprite {
  transition-property: opacity;
  transition-timing-function: ease-in-out;
}
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.hex-hit {
  fill: transparent;
  stroke: transparent;
  stroke-width: 2px;
  pointer-events: all;
  cursor: pointer;
}
.hex-hit.hovered {
  stroke: var(--gold);
}
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1.4em;
}

@media (prefers-reduced-motion: reduce) {
  .island-sprite {
    transition: none !important;
  }
}
</style>

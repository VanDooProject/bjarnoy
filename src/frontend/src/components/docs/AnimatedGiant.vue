<script setup lang="ts">
// A standalone, animated giant composite for the Wasted Lands docs page's
// giant cards (WastedLandsView.vue): the same 7 ground-plate-base + 7
// top-part draw WastedIsland.vue's giant placements use (see that module's
// doc comment for why a giant is 14 separate per-hex sprites rather than one
// pre-composited `showcase` frame), rendered on its own rather than as part
// of an island, with any `buildings-anim` clip a top part has playing
// instead of sitting on its static frame. Only mounted while a card is
// hovered/focused — see WastedLandsView.vue's own `giantFamilyHasClip` gate,
// which decides whether a family gets this treatment at all (today just the
// wasted volcano; the wasted Utgard ruin has no clips and stays a plain
// `<AtlasSprite>`).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { isoGridPosition } from '../../lib/hex/geometry';
import { atlasBackgroundStyle, type AtlasBackgroundStyle } from '../../lib/map/atlas';
import { giantCoverage, GIANT_NEIGHBOR_PARTS, type GiantPart } from '../../lib/map/giantTiles';
import type { TileOrientation } from '../../lib/map/types';
import {
  resolveIslandFrame,
  resolveIslandClip,
  tileSpriteBox,
  giantTopPartBox,
  TOP_FACE_Y,
  type SpriteGeom,
} from '../../lib/docs/wastedIsland';
import { clipFrameIndex, clipTimingOf } from '../../lib/map/clipPlayback';
import { useAnimationClock } from '../../composables/useAnimationClock';

const props = defineProps<{
  /** The top-part family (e.g. `giantvolcano_wasted`) — whichever state (living/wasted) the card is showing. */
  family: string;
  /** The atlas category the top part's static frame lives in (`buildings-static`/`terrain`), for the fallback when a part has no clip. */
  topCategory: string;
  /** The `showcase` ground-plate family under all 7 hexes (`grasstile`/`wasteland`). */
  plateFamily: string;
  orientation: TileOrientation;
}>();

const TILE_W = 400;
const TOP_FACE_H = 184;
const ANCHOR = { q: 0, r: 0 };
const ALL_PARTS: GiantPart[] = ['C', ...GIANT_NEIGHBOR_PARTS];

interface PartLayout {
  part: GiantPart;
  depth: number;
  x: number;
  plate: { box: SpriteGeom; style: AtlasBackgroundStyle } | null;
  top: { box: SpriteGeom; style: AtlasBackgroundStyle } | null;
  /** `buildings-anim` clip for this part's top, when one exists — resolved once per family/orientation, not per animation tick. */
  clip: ReturnType<typeof resolveIslandClip>;
}

// Precomputed off `family`/`plateFamily`/`orientation` (which camera pill is
// selected) — not off the animation clock. Mirrors WastedIsland.vue's own
// `resolved`/`clipLookups` split for the same reason: the clip's frames
// share their static frame's exact geometry, so only the background image
// needs to change per tick, not the box.
const layout = computed<PartLayout[]>(() => {
  const out: PartLayout[] = [];
  for (const { coord, part } of giantCoverage(ANCHOR)) {
    const g = isoGridPosition(coord, TILE_W, TOP_FACE_H);
    const origin = { x: g.x, y: g.y - TOP_FACE_Y };

    const plateRect = resolveIslandFrame(`${props.plateFamily}_${props.orientation}`, 'showcase');
    const plate = plateRect
      ? {
          box: tileSpriteBox(origin, plateRect),
          style: atlasBackgroundStyle(plateRect),
        }
      : null;

    const topName = `${props.family}_${props.orientation}_level000_part${part}`;
    const topRect = resolveIslandFrame(topName, props.topCategory);
    const top = topRect
      ? {
          box: giantTopPartBox(origin, topRect),
          style: atlasBackgroundStyle(topRect),
        }
      : null;

    out.push({
      part,
      depth: g.y,
      x: g.x,
      plate,
      top,
      clip: resolveIslandClip(topName),
    });
  }
  // Same painter's-algorithm order as buildIsland: depth, then x, then a
  // hex's own plate before its own top part.
  return out.sort((a, b) => a.depth - b.depth || a.x - b.x);
});

// --- Per-tick clip playback ----------------------------------------------

const now = useAnimationClock();

const topStyles = computed<Map<GiantPart, AtlasBackgroundStyle>>(() => {
  const map = new Map<GiantPart, AtlasBackgroundStyle>();
  const elapsed = now.value;
  for (const entry of layout.value) {
    if (!entry.clip) continue;
    const idx = clipFrameIndex(clipTimingOf(entry.clip), elapsed);
    map.set(entry.part, atlasBackgroundStyle(entry.clip.frameRects[idx]!));
  }
  return map;
});

function topStyleFor(entry: PartLayout): AtlasBackgroundStyle | undefined {
  return topStyles.value.get(entry.part) ?? entry.top?.style;
}

// --- Bounds + contain-fit scale -------------------------------------------

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
  for (const entry of layout.value) {
    for (const box of [entry.plate?.box, entry.top?.box]) {
      if (!box) continue;
      grow(box.left, box.top);
      grow(box.left + box.width, box.top + box.height);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: TILE_W, height: TOP_FACE_H };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
});

function positionStyle(box: SpriteGeom): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const b = bounds.value;
  return {
    left: `${box.left - b.minX}px`,
    top: `${box.top - b.minY}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

const rootEl = shallowRef<HTMLElement | null>(null);
const containerSize = ref({ w: 0, h: 0 });
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry)
        containerSize.value = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
    });
    resizeObserver.observe(rootEl.value);
    containerSize.value = {
      w: rootEl.value.clientWidth,
      h: rootEl.value.clientHeight,
    };
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());

// Contain-fit (not just width, like WastedIsland's own scale): this sits in
// a fixed-height card box rather than a full-width page section, so both
// dimensions can constrain it depending on the giant's own aspect ratio.
const scale = computed(() => {
  const { w, h } = containerSize.value;
  const b = bounds.value;
  if (!w || !h || !b.width || !b.height) return 1;
  return Math.min(w / b.width, h / b.height);
});
</script>

<template>
  <div ref="rootEl" class="animated-giant" role="img">
    <div
      class="world"
      :style="{
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }"
    >
      <template v-for="entry in layout" :key="entry.part">
        <div
          v-if="entry.plate"
          class="giant-sprite"
          :style="{ ...entry.plate.style, ...positionStyle(entry.plate.box) }"
        />
        <div
          v-if="entry.top"
          class="giant-sprite"
          :style="{ ...topStyleFor(entry), ...positionStyle(entry.top.box) }"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.animated-giant {
  position: relative;
  width: 100%;
  height: 100%;
}
.world {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center;
}
.giant-sprite {
  position: absolute;
}
</style>

<script setup lang="ts">
// A wildlife camp's guarded state, animated, for the camps docs page
// (WildlifeCampsView.vue): the cleared camp's `showcase` frame (ground plus
// the empty camp, 400x600 canvas) with the guarded level's `buildings-anim`
// clip playing over it. A camp clip is an overlay clip whose frames carry
// only the animals (every camp part is animated and sets
// `anim_rest_shadow = False`, 3D_assets docs/wildlife-camps.md), so the
// cleared frame is the whole still background and the clip's own rest image
// - the same camp at half the resolution - is not drawn.
//
// The clip is rendered at 200x300, half the showcase canvas, so its frames
// are drawn at 2x into the same canvas. The view is cropped to the union of
// the background's trim and every clip frame's box (the eyrie's circling
// eagle flies above the stack's own trim) and contain-fitted into its box.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { atlasBackgroundStyle, findAtlasClip, findAtlasFrame, type AtlasFrameRect } from '../../lib/map/atlas';
import { clipFrameIndex, clipTimingOf } from '../../lib/map/clipPlayback';
import type { TileOrientation } from '../../lib/map/types';
import { useAnimationClock } from '../../composables/useAnimationClock';

const props = defineProps<{ family: string; orientation: TileOrientation }>();

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A frame's box on the 400x600 showcase canvas; `k` scales a half-size (200x300) clip frame up. */
function boxOf(rect: AtlasFrameRect, k: number): Box {
  return {
    left: k * rect.spriteSourceSize.x,
    top: k * rect.spriteSourceSize.y,
    width: k * rect.frame.w,
    height: k * rect.frame.h,
  };
}

const background = computed(() => findAtlasFrame('showcase', `${props.family}_${props.orientation}_level000`));

const clip = computed(() => {
  const c = findAtlasClip('buildings-anim', `${props.family}_${props.orientation}_level001`);
  if (!c || c.frameRects.length === 0 || !background.value) return null;
  const k = background.value.sourceSize.w / c.frameRects[0]!.sourceSize.w;
  return { timing: clipTimingOf(c), frames: c.frameRects.map((rect) => ({ rect, box: boxOf(rect, k) })) };
});

const bounds = computed<Box>(() => {
  const boxes = [
    ...(background.value ? [boxOf(background.value, 1)] : []),
    ...(clip.value?.frames.map((f) => f.box) ?? []),
  ];
  if (boxes.length === 0) return { left: 0, top: 0, width: 400, height: 600 };
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
});

const now = useAnimationClock();
const frame = computed(() => {
  const c = clip.value;
  return c ? c.frames[clipFrameIndex(c.timing, now.value)]! : null;
});

function place(rect: AtlasFrameRect, box: Box) {
  const b = bounds.value;
  return {
    ...atlasBackgroundStyle(rect),
    left: `${box.left - b.left}px`,
    top: `${box.top - b.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

const rootEl = shallowRef<HTMLElement | null>(null);
const size = ref({ w: 0, h: 0 });
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!rootEl.value) return;
  size.value = { w: rootEl.value.clientWidth, h: rootEl.value.clientHeight };
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    if (entry) size.value = { w: entry.contentRect.width, h: entry.contentRect.height };
  });
  observer.observe(rootEl.value);
});
onBeforeUnmount(() => observer?.disconnect());

const scale = computed(() => {
  const { w, h } = size.value;
  const b = bounds.value;
  return w && h ? Math.min(w / b.width, h / b.height) : 1;
});
</script>

<template>
  <div ref="rootEl" class="animated-camp" role="img" :data-animated="clip ? 'true' : 'false'">
    <div
      class="world"
      :style="{
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }"
    >
      <div v-if="background" class="layer" :style="place(background, boxOf(background, 1))" />
      <div v-if="frame" class="layer" :style="place(frame.rect, frame.box)" />
    </div>
  </div>
</template>

<style scoped>
.animated-camp {
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
.layer {
  position: absolute;
}
</style>

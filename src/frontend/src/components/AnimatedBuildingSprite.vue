<script setup lang="ts">
// Composites a building's `buildings-static` base layer with its top
// layer — either the single static top frame, or (when one exists) a
// `buildings-anim` clip cycling through that layer's moving-part frames —
// as two plain HTML elements. Unlike <AtlasSprite>, which renders one
// flattened `showcase` picture, the two layers here are positioned
// separately within a shared `sourceSize` canvas (via each frame's
// `spriteSourceSize`, the same trim-offset Pixi uses) so the animated top
// layer lines up with the static base underneath it instead of assuming
// every frame fills its own box.
import { computed, onBeforeUnmount, watch } from 'vue';
import { ref } from 'vue';
import type { AtlasFrameRect } from '../lib/map/atlas';
import type { BuildingLayers } from '../lib/map/buildingArt';

const props = defineProps<{ layers: BuildingLayers }>();

const canvasSize = computed(() => props.layers.base?.sourceSize ?? props.layers.top?.sourceSize ?? { w: 1, h: 1 });

function layerStyle(rect: AtlasFrameRect) {
  const { webpUrl, frame, pageSize, spriteSourceSize, sourceSize } = rect;
  const bgWidthPct = (pageSize.w / frame.w) * 100;
  const bgHeightPct = (pageSize.h / frame.h) * 100;
  const posXPct = pageSize.w === frame.w ? 0 : (frame.x / (pageSize.w - frame.w)) * 100;
  const posYPct = pageSize.h === frame.h ? 0 : (frame.y / (pageSize.h - frame.h)) * 100;
  return {
    left: `${(spriteSourceSize.x / sourceSize.w) * 100}%`,
    top: `${(spriteSourceSize.y / sourceSize.h) * 100}%`,
    width: `${(spriteSourceSize.w / sourceSize.w) * 100}%`,
    height: `${(spriteSourceSize.h / sourceSize.h) * 100}%`,
    backgroundImage: `url(${webpUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${bgWidthPct}% ${bgHeightPct}%`,
    backgroundPosition: `${posXPct}% ${posYPct}%`,
  };
}

const baseStyle = computed(() => (props.layers.base ? layerStyle(props.layers.base) : null));

// The playback position, in units of "clip frames" — an integer index into
// `frameRects` for `loop`, but left unclamped and folded into a bounce for
// `pingpong` so a single incrementing counter drives both. `pause` (seconds
// of extra dwell at the loop's end/turnaround, per the atlas manifest) is
// spent holding the position rather than advancing it.
const position = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function clipFrameCount(): number {
  return props.layers.clip?.frameRects.length ?? 0;
}

function stepsPerCycle(): number {
  const n = clipFrameCount();
  const clip = props.layers.clip;
  const pauseSteps = clip ? Math.round(clip.pause * clip.fps) : 0;
  return clip?.playback === 'pingpong' ? Math.max(1, n * 2 - 2) + pauseSteps : n + pauseSteps;
}

function frameIndexAt(step: number): number {
  const n = clipFrameCount();
  const clip = props.layers.clip;
  if (n === 0 || !clip) return 0;
  if (clip.playback === 'pingpong') {
    const cycle = Math.max(1, n * 2 - 2);
    const s = step % cycle;
    return s < n ? s : cycle - s;
  }
  return Math.min(step, n - 1);
}

const currentTopFrame = computed<AtlasFrameRect | undefined>(() => {
  const clip = props.layers.clip;
  if (!clip || clip.frameRects.length === 0) return props.layers.top;
  return clip.frameRects[frameIndexAt(position.value)];
});

const topStyle = computed(() => (currentTopFrame.value ? layerStyle(currentTopFrame.value) : null));

function stopAnimation() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function startAnimation() {
  stopAnimation();
  position.value = 0;
  const clip = props.layers.clip;
  if (!clip || clip.frameRects.length <= 1) return;
  const total = stepsPerCycle();
  timer = setInterval(() => {
    position.value = (position.value + 1) % total;
  }, 1000 / clip.fps);
}

watch(() => props.layers.clip, startAnimation, { immediate: true });
onBeforeUnmount(stopAnimation);
</script>

<template>
  <div class="animated-building" role="img" :style="{ aspectRatio: `${canvasSize.w} / ${canvasSize.h}` }">
    <div v-if="baseStyle" class="layer" :style="baseStyle" />
    <div v-if="topStyle" class="layer" :style="topStyle" />
  </div>
</template>

<style scoped>
.animated-building {
  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
}
.layer {
  position: absolute;
}
</style>

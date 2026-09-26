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
import { clipFrameIndex, clipTimingOf } from '../lib/map/clipPlayback';

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

// The clip's rest image (the building with its moving parts held still) —
// only present for an "overlay" clip (3D_assets PR #92: its frames carry only
// the moving parts, everything else transparent). Static for as long as this
// exact clip plays, drawn *underneath* the frame layer below rather than
// swapped with it — the two together make the whole building, same as the
// old full-frame clips made it in one image. A legacy clip has no `restRect`
// at all, so this stays null and the top layer alone plays, unchanged.
const restStyle = computed(() => {
  const clip = props.layers.clip;
  return clip?.restRect ? layerStyle(clip.restRect) : null;
});

// Elapsed playback time, in ms since this clip (re)started — fed to
// `clipFrameIndex` (clipPlayback.ts), which owns the loop/pingpong/pause
// math itself so it isn't duplicated per clip player (see that module and
// `useAnimationClock.ts`, its multi-sprite sibling).
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

const currentTopFrame = computed<AtlasFrameRect | undefined>(() => {
  const clip = props.layers.clip;
  if (!clip || clip.frameRects.length === 0) return props.layers.top;
  return clip.frameRects[clipFrameIndex(clipTimingOf(clip), elapsed.value)];
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
  elapsed.value = 0;
  const clip = props.layers.clip;
  if (!clip || clip.frameRects.length <= 1) return;
  const period = 1000 / clip.fps;
  timer = setInterval(() => {
    elapsed.value += period;
  }, period);
}

watch(() => props.layers.clip, startAnimation, { immediate: true });
onBeforeUnmount(stopAnimation);
</script>

<template>
  <div class="animated-building" role="img" :style="{ aspectRatio: `${canvasSize.w} / ${canvasSize.h}` }">
    <div v-if="baseStyle" class="layer" :style="baseStyle" />
    <div v-if="restStyle" class="layer" :style="restStyle" />
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

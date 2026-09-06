<script setup lang="ts">
// Renders one frame out of a WebP atlas page as a plain HTML element,
// without decoding it through Pixi first — used by the non-canvas UI
// (docs pages, tooltips, build overlays) that wants the same higher-res
// showcase art the map renderer's atlas.ts already loads, but as a normal
// DOM image rather than a GPU texture.
//
// The frame renders at its own aspect ratio (no cropping): give the parent
// a fixed size and this fits inside it, same as `object-fit: contain`.
import { computed } from 'vue';
import type { AtlasFrameRect } from '../lib/map/atlas';

const props = defineProps<{ frame: AtlasFrameRect }>();

const style = computed(() => {
  const { webpUrl, frame, pageSize } = props.frame;
  const bgWidthPct = (pageSize.w / frame.w) * 100;
  const bgHeightPct = (pageSize.h / frame.h) * 100;
  const posXPct = pageSize.w === frame.w ? 0 : (frame.x / (pageSize.w - frame.w)) * 100;
  const posYPct = pageSize.h === frame.h ? 0 : (frame.y / (pageSize.h - frame.h)) * 100;
  return {
    aspectRatio: `${frame.w} / ${frame.h}`,
    backgroundImage: `url(${webpUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${bgWidthPct}% ${bgHeightPct}%`,
    backgroundPosition: `${posXPct}% ${posYPct}%`,
  };
});
</script>

<template>
  <div class="atlas-sprite" role="img" :style="style" />
</template>

<style scoped>
.atlas-sprite {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
}
</style>

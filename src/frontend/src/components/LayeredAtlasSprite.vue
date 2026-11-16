<script setup lang="ts">
// Several atlas frames stacked into one picture, bottom first: a terrain look the pack ships as a base slab plus a top
// layer. Every frame is placed where its trimmed rect sat in the untrimmed source canvas (`spriteSourceSize`), so the
// layers line up without any per-family offsets. Like `AtlasSprite`, it fits the parent's box.
import { computed } from 'vue';
import type { AtlasFrameRect } from '../lib/map/atlas';
import AtlasSprite from './AtlasSprite.vue';

const props = defineProps<{ frames: AtlasFrameRect[] }>();

const size = computed(() => props.frames[0]?.sourceSize ?? { w: 1, h: 1 });
const canvasStyle = computed(() => ({ aspectRatio: `${size.value.w} / ${size.value.h}` }));

function layerStyle(frame: AtlasFrameRect) {
  const { x, y, w, h } = frame.spriteSourceSize;
  return {
    left: `${(x / size.value.w) * 100}%`,
    top: `${(y / size.value.h) * 100}%`,
    width: `${(w / size.value.w) * 100}%`,
    height: `${(h / size.value.h) * 100}%`,
  };
}
</script>

<template>
  <div class="layered-atlas-sprite" :style="canvasStyle">
    <div v-for="(frame, i) in frames" :key="i" class="layer" :style="layerStyle(frame)">
      <AtlasSprite :frame="frame" />
    </div>
  </div>
</template>

<style scoped>
.layered-atlas-sprite {
  position: relative;
  width: 100%;
  max-height: 100%;
}
.layer {
  position: absolute;
}
</style>

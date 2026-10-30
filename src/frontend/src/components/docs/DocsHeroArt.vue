<script setup lang="ts">
import AtlasSprite from '../AtlasSprite.vue';
import type { AtlasFrameRect } from '../../lib/map/atlas';

// The picture at the top of a docs page, under the lede: a showcase frame contain-fitted into a box 150px high, or
// whatever the default slot holds (an animated building) when the page brings its own sprite.
const props = withDefaults(defineProps<{ frame?: AtlasFrameRect | null; height?: number }>(), { frame: null, height: 150 });
const fit = (f: AtlasFrameRect) => ({ width: `min(100%, ${(props.height * f.frame.w) / f.frame.h}px)` });
</script>

<template>
  <div class="hero-art" data-testid="page-art">
    <slot>
      <AtlasSprite v-if="frame" :frame="frame" :style="fit(frame)" />
    </slot>
  </div>
</template>

<style scoped>
.hero-art {
  display: flex;
  justify-content: center;
  margin: 0 0 8px;
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.55));
}
</style>

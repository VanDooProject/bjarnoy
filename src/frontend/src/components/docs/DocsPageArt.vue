<script setup lang="ts">
import { computed } from 'vue';
import AtlasSprite from '../AtlasSprite.vue';
import { findAtlasFrame } from '../../lib/map/atlas';
import { docsStillFrameName } from '../../lib/docs/docsPages';

// A docs page's art as a still picture in a square box: the entry's `art` string (see docsPages.ts) resolved to its
// showcase frame and contain-fitted. Used where the art is small and quiet (breadcrumb menus, "Related" cards, the
// page header); the hub's cards play the animated variants themselves.
const props = defineProps<{ art: string; size: number }>();

const frame = computed(() => findAtlasFrame('showcase', docsStillFrameName(props.art)));
// AtlasSprite keeps the frame's aspect ratio, so a width of min(100%, box height x ratio) contain-fits it.
const fit = computed(() => (frame.value ? { width: `min(100%, ${(props.size * frame.value.frame.w) / frame.value.frame.h}px)` } : {}));
</script>

<template>
  <span class="docs-page-art" data-testid="docs-page-art" :data-art="art" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <AtlasSprite v-if="frame" :frame="frame" :style="fit" />
  </span>
</template>

<style scoped>
.docs-page-art {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>

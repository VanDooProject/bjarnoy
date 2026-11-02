<script setup lang="ts">
// One palisade piece the way the game draws it: the ground's `terrain` base frame with the piece's own
// `buildings-static` top on it, layered into one picture. The sea end stands in water, so it uses its own
// base. A frame the atlas does not have simply leaves its layer out.
import { computed } from 'vue';
import AnimatedBuildingSprite from '../AnimatedBuildingSprite.vue';
import { findAtlasFrame } from '../../lib/map/atlas';
import type { BuildingLayers } from '../../lib/map/buildingArt';
import type { PalisadePiece } from '../../lib/map/palisadeTiles';
import type { TileOrientation } from '../../lib/map/types';
import { pieceFrameNames, type WallGround } from '../../lib/docs/palisadeDocs';

const props = withDefaults(
  defineProps<{ piece: PalisadePiece; dir: TileOrientation; stage: number; ground?: WallGround }>(),
  { ground: 'grass' },
);

const layers = computed<BuildingLayers>(() => {
  const names = pieceFrameNames(props.piece, props.dir, props.stage, props.ground);
  return {
    base: findAtlasFrame('buildings-static', names.ownBase) ?? findAtlasFrame('terrain', names.base),
    top: findAtlasFrame('buildings-static', names.top),
  };
});
</script>

<template>
  <AnimatedBuildingSprite v-if="layers.top" class="wall-piece" :layers="layers" />
</template>

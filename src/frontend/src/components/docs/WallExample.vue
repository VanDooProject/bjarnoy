<script setup lang="ts">
// The Walls docs page's example: a short wall laid out on a hex grid, every hex's piece and rotation worked
// out by the game's own rules (palisadeTiles.ts, through lib/docs/palisadeDocs.ts) and drawn as the ground's
// base frame with the piece's top frame on it, the same way the map composes a wall hex. One end runs out
// into the sea, so the sea end is shown standing in its water.
//
// TODO(palisade #378): once palisade rendering is on main, draw this through the real HexMapRenderer with a
// StaticWorldModel, the way BogIsland.vue does, so it renders exactly like the game. Until then it is plain
// DOM sprites placed with the renderer's own hex grid maths.
import { computed } from 'vue';
import { isoGridPosition } from '../../lib/hex/geometry';
import { atlasBackgroundStyle, findAtlasFrame, type AtlasFrameRect } from '../../lib/map/atlas';
import { isRefusal } from '../../lib/map/palisadeTiles';
import {
  exampleGroundHexes,
  exampleWallHexes,
  pieceFrameNames,
  resolveExampleWall,
  stagesOf,
} from '../../lib/docs/palisadeDocs';
import { tileSpriteBox, type SpriteGeom } from '../../lib/docs/wastedIsland';

// The `terrain` and `buildings-static` frames are 200x300 canvases (the showcase ones are twice that); a
// tile's top face is 92 high and starts 140 down its canvas.
const TILE_W = 200;
const TOP_FACE_H = 92;
const TOP_FACE_Y = 140;

interface Sprite {
  key: string;
  depth: number;
  x: number;
  layer: number;
  rect: AtlasFrameRect;
  box: SpriteGeom;
}

const sprites = computed<Sprite[]>(() => {
  const out: Sprite[] = [];
  const add = (key: string, coord: { q: number; r: number }, layer: number, rect: AtlasFrameRect | undefined) => {
    if (!rect) return;
    const g = isoGridPosition(coord, TILE_W, TOP_FACE_H);
    out.push({
      key,
      depth: g.y,
      x: g.x,
      layer,
      rect,
      box: tileSpriteBox({ x: g.x, y: g.y - TOP_FACE_Y }, rect),
    });
  };

  for (const { coord: c, sea } of exampleGroundHexes()) {
    // Open sea around the sea end: the plain water tile, which has no beach rim to turn the wrong way.
    const frame = sea ? 'watertile_SE_base' : pieceFrameNames('straight180', 'SE', 0, 'grass').base;
    add(`g${c.q},${c.r}`, c, 0, findAtlasFrame('terrain', frame));
  }
  for (const { coord, result } of resolveExampleWall()) {
    if (isRefusal(result)) continue;
    // The finished wall: the last stage the atlas has for this piece.
    const stage = stagesOf(result.piece, (n) => !!findAtlasFrame('buildings-static', n)).at(-1) ?? 0;
    const names = pieceFrameNames(result.piece, result.dir, stage, 'grass');
    const k = `${coord.q},${coord.r}`;
    // A piece's own leveled base ships beside its top in the buildings atlases; the plain ground one in `terrain`.
    const base =
      findAtlasFrame('buildings-static', names.ownBase) ??
      findAtlasFrame('buildings-level1', names.ownBase) ??
      findAtlasFrame('terrain', names.base);
    add(`b${k}`, coord, 0, base);
    add(`t${k}`, coord, 1, findAtlasFrame('buildings-static', names.top));
  }
  // Painter's order: back rows first, a hex's own ground before its wall.
  return out.sort((a, b) => a.depth - b.depth || a.x - b.x || a.layer - b.layer);
});

const bounds = computed(() => {
  const boxes = sprites.value.map((s) => s.box);
  if (boxes.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  return {
    left,
    top,
    width: Math.max(...boxes.map((b) => b.left + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.top + b.height)) - top,
  };
});

function place(box: SpriteGeom) {
  const b = bounds.value;
  return {
    left: `${((box.left - b.left) / b.width) * 100}%`,
    top: `${((box.top - b.top) / b.height) * 100}%`,
    width: `${(box.width / b.width) * 100}%`,
    height: `${(box.height / b.height) * 100}%`,
  };
}

const pieceCount = exampleWallHexes().length;
</script>

<template>
  <div class="wall-example" role="img" :aria-label="$t('docs.walls.example.alt', { count: pieceCount })">
    <div class="world" :style="{ aspectRatio: `${bounds.width} / ${bounds.height}` }">
      <div
        v-for="s in sprites"
        :key="s.key"
        class="sprite"
        :style="{ ...atlasBackgroundStyle(s.rect), ...place(s.box) }"
      />
    </div>
  </div>
</template>

<style scoped>
.wall-example {
  display: flex;
  justify-content: center;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
}
.world {
  position: relative;
  width: 100%;
  max-width: 760px;
}
.sprite {
  position: absolute;
}
</style>

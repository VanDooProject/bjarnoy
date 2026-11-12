// Which hexes the water mesh has to cover, and the geometry that covers them —
// docs/design/water-shader.md §3.7.
//
// The water shader used to run on one quad over the whole baked rect, land
// included, only to `discard` there. In the software renderer the rasterising
// and blending of that quad alone cost ~150 ms a frame, and in settlement view
// most of the screen is land. The shader can only draw in two places, so the
// mesh covers exactly those (river flow has its own mesh, riverFlowMesh.ts):
//
//   1. sea hexes: pixels the mask calls water (`R > 0.5`), where the sea body,
//      caustics, waves and the settlement-mode taint wash are drawn;
//   2. the shore ring: every land hex touching a sea hex, because the foam
//      reaches onto the beach by `uFoamWidth * uFoamLandReach` tile widths
//      (0.3 * 0.12 = 0.036 of a tile in settlement view at the default tuning,
//      `FOAM_WIDTH_RANGE.max * 0.12 = 0.18` at the slider's highest; a hex is
//      `HEX_ACROSS_FLATS_TILES` ~0.87 tile across the ground, so a hex that
//      does not touch the sea is at least that far from it), which one ring of
//      land covers many times over.
//
// Only hexes that overlap the mask's rect are emitted: the mask says nothing
// outside it, and the shaders discard there.
//
// Each covered hex is its exact top-face hexagon (`isoTopPoints`), built from
// shared lattice coordinates, so neighbouring hexes share bit-identical edge
// vertices: the rasteriser leaves no crack and draws no pixel twice, which is
// why there is no outward margin to overdraw (the blend is not idempotent).
import { isoTopPoints } from '../../hex/geometry';
import type { WaterMask } from './waterMask';
import type { WorldRect } from './waterMaskLayout';

/** A hex in odd-q offset coordinates, the lattice `isoGridPosition` places by. */
export interface OffsetHex {
  col: number;
  row: number;
}

/** Distance across a hex between two opposite flats, in tile widths: how far from the sea a land hex that does not touch it is. */
export const HEX_ACROSS_FLATS_TILES = Math.sqrt(3) / 2;

/** R byte of the mask at or above this is water (`R = 0.5` is the coastline). */
const WATER_R_BYTE = 128;

/**
 * Every sea hex of the mask's region, and every land hex adjacent to one — the
 * sea and shore terms of the cover. Water is read off the mask itself, at each
 * hex's centre (always deep inside the hex, so never ambiguous), so it agrees
 * with what the bake saw whichever thread baked it.
 *
 * One extra hex past the region on every side is classified with the nearest
 * texel so hexes straddling the region's edge are judged right (and are seen
 * as neighbours), but only hexes overlapping the region's rect are returned.
 */
export function seaAndShoreHexes(mask: WaterMask, tileWidth: number, tileHeight: number): OffsetHex[] {
  const { rect, width, height, texelWorldSize } = mask.region;
  const colPitch = tileWidth * 0.75;
  const col0 = Math.floor(rect.minX / colPitch) - 1;
  const col1 = Math.ceil(rect.maxX / colPitch) + 1;
  const row0 = Math.floor(rect.minY / tileHeight) - 1;
  const row1 = Math.ceil(rect.maxY / tileHeight) + 1;
  const cols = col1 - col0 + 1;
  const rows = row1 - row0 + 1;

  const isSea = new Uint8Array(cols * rows);
  const data = mask.data;
  for (let c = 0; c < cols; c++) {
    const col = col0 + c;
    const cx = col * colPitch + tileWidth / 2;
    const tx = Math.min(width - 1, Math.max(0, Math.floor((cx - rect.minX) / texelWorldSize)));
    const yShift = col & 1 ? tileHeight / 2 : 0;
    for (let r = 0; r < rows; r++) {
      const cy = (row0 + r) * tileHeight + yShift + tileHeight / 2;
      const ty = Math.min(height - 1, Math.max(0, Math.floor((cy - rect.minY) / texelWorldSize)));
      if (data[(ty * width + tx) * 4]! >= WATER_R_BYTE) isSea[c * rows + r] = 1;
    }
  }

  const hexes: OffsetHex[] = [];
  const seaAt = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows && isSea[c * rows + r] === 1;
  for (let c = 0; c < cols; c++) {
    const odd = (col0 + c) & 1;
    // Odd columns sit half a hex lower, so their side neighbours are rows r and r + 1; even columns', r - 1 and r.
    const sideLo = odd ? 0 : -1;
    const sideHi = odd ? 1 : 0;
    const x0 = (col0 + c) * colPitch;
    if (x0 >= rect.maxX || x0 + tileWidth <= rect.minX) continue;
    const yShift = odd ? tileHeight / 2 : 0;
    for (let r = 0; r < rows; r++) {
      const y0 = (row0 + r) * tileHeight + yShift;
      if (y0 >= rect.maxY || y0 + tileHeight <= rect.minY) continue;
      const covered =
        isSea[c * rows + r] === 1 ||
        seaAt(c, r - 1) ||
        seaAt(c, r + 1) ||
        seaAt(c - 1, r + sideLo) ||
        seaAt(c - 1, r + sideHi) ||
        seaAt(c + 1, r + sideLo) ||
        seaAt(c + 1, r + sideHi);
      if (covered) hexes.push({ col: col0 + c, row: row0 + r });
    }
  }
  return hexes;
}

/** Vertices and indices per hex: the top-face hexagon as a fan of four triangles. */
const VERTS_PER_HEX = 6;
const INDICES_PER_HEX = 12;

/** The mesh's CPU-side buffers, grown on demand and reused across bakes. */
export class WaterMeshBuffers {
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private indices = new Uint32Array(0);

  /**
   * Fills the buffers with one hexagon per hex and returns views of exactly
   * the used length. UVs are the mask's (`world -> rect`), so the fragment
   * shader sees what it saw on the single quad.
   */
  fill(
    hexes: readonly OffsetHex[],
    tileWidth: number,
    tileHeight: number,
    rect: WorldRect,
  ): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const n = hexes.length;
    if (this.positions.length < n * VERTS_PER_HEX * 2) {
      const cap = Math.max(n, Math.ceil(this.positions.length / (VERTS_PER_HEX * 2)) * 2);
      this.positions = new Float32Array(cap * VERTS_PER_HEX * 2);
      this.uvs = new Float32Array(cap * VERTS_PER_HEX * 2);
      this.indices = new Uint32Array(cap * INDICES_PER_HEX);
    }
    // Lattice steps: every top-face vertex sits at (i * w / 4, j * h / 2) for integers i, j, so two hexes
    // sharing a vertex compute the very same floats from the very same integers.
    const stepX = tileWidth / 4;
    const stepY = tileHeight / 2;
    const top = isoTopPoints(tileWidth, tileHeight);
    const vi = top.map((p) => Math.round(p.x / stepX));
    const vj = top.map((p) => Math.round(p.y / stepY));
    const invW = 1 / (rect.maxX - rect.minX);
    const invH = 1 / (rect.maxY - rect.minY);
    const { positions, uvs, indices } = this;
    for (let k = 0; k < n; k++) {
      const { col, row } = hexes[k]!;
      const i0 = col * 3;
      const j0 = row * 2 + (col & 1);
      const base = k * VERTS_PER_HEX;
      for (let v = 0; v < VERTS_PER_HEX; v++) {
        const x = (i0 + vi[v]!) * stepX;
        const y = (j0 + vj[v]!) * stepY;
        const o = (base + v) * 2;
        positions[o] = x;
        positions[o + 1] = y;
        uvs[o] = (x - rect.minX) * invW;
        uvs[o + 1] = (y - rect.minY) * invH;
      }
      const io = k * INDICES_PER_HEX;
      for (let t = 0; t < 4; t++) {
        indices[io + t * 3] = base;
        indices[io + t * 3 + 1] = base + 1 + t;
        indices[io + t * 3 + 2] = base + 2 + t;
      }
    }
    return {
      positions: positions.subarray(0, n * VERTS_PER_HEX * 2),
      uvs: uvs.subarray(0, n * VERTS_PER_HEX * 2),
      indices: indices.subarray(0, n * INDICES_PER_HEX),
    };
  }
}

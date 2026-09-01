// Demo mode has no backend to fetch a fog mask PNG from (see config.ts's
// DEMO_MODE), so `setFogMask` (HexMapRenderer.ts) never gets called via
// `stores/world.ts`'s `fetchFogMask`, which early-returns under DEMO_MODE.
// Left unaddressed, both fog layers stay on their default placeholder
// texture (fully-unknown, opaque — see FogMaskLayer.ts) forever, blanketing
// the whole viewport. This module bakes an equivalent mask directly from the
// client-side `WorldModel`'s own already-computed per-hex state instead,
// mirroring `FogMaskGenerator.Generate` (backend,
// src/backend/src/Bjarnoy.Domain/World/FogMaskGenerator.cs) closely enough
// to read correctly through the same shader — not a byte-for-byte port (see
// fogMaskLayout.ts's own note on that being deliberately out of scope here).
import type { AxialCoord } from '../../hex/coords';
import { hexDistance } from '../../hex/coords';
import type { Settlement } from '../types';
import type { WorldModel } from '../WorldModel';
import {
  diagonalNeighboursForInterpolation,
  isHexTexel,
  toHex,
  worldMaskBounds,
  type MaskBounds,
  type MaskTexel,
} from './fogMaskLayout';

// Mirrors FogMaskOptions' defaults (UnknownMarginHexes / OutOfSightMarginHexes)
// — UNKNOWN_MARGIN_HEXES also matches HexMapRenderer's own FOG_MARGIN_HEXES.
const UNKNOWN_MARGIN_HEXES = 10;
const OUT_OF_SIGHT_MARGIN_HEXES = 2;

// Demo worlds are boundless and procedurally generated on demand — there is
// no stored world radius the way a live world has one (see WorldModel's own
// "no stored radius anywhere" comment). LandingView always founds the demo
// settlement within 40 hexes of the origin (`findLandfall({ q: 0, r: 0 })`,
// maxRadius 40), so a mask bounded at this radius comfortably covers the
// settlement plus its explored/visible margins for a normal session. A very
// high-level settlement's fog can in principle reach past this bound — that
// ground just reads as "never scouted" out there (the shader's own
// out-of-bounds handling, fogShader.ts's sampleMask), never a leak or crash.
export const DEMO_MASK_RADIUS = 60;

function ramp(distance: number, marginHexes: number): number {
  if (!Number.isFinite(distance)) return 255;
  if (distance <= 0) return 0;
  if (marginHexes <= 0 || distance >= marginHexes) return 255;
  return Math.round((255 * distance) / marginHexes);
}

// Deterministic per-hex pseudo-random seed for the shader's UV warp
// (fogShader.ts). Doesn't need to match the backend's exact byte values —
// unlike the mask's fog channels, this is never compared across client and
// server, only sampled locally.
function noiseSeed(hex: AxialCoord): number {
  let h = (hex.q * 374761393 + hex.r * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h & 0xff;
}

// visibleHexes' own radius (WorldModel.ts) — not exposed directly, so
// recomputed here from the public borderRadius the same way.
function visibleRadius(model: WorldModel, settlement: Settlement): number {
  return model.borderRadius(settlement) + 1;
}

function distanceBeyondVisible(model: WorldModel, settlements: Settlement[], hex: AxialCoord): number {
  let min = Infinity;
  for (const settlement of settlements) {
    const d = hexDistance({ q: settlement.q, r: settlement.r }, hex) - visibleRadius(model, settlement);
    if (d < min) min = d;
  }
  return min === Infinity ? Infinity : Math.max(0, min);
}

interface DemoFogMaskCell {
  unknown: number;
  outOfSight: number;
  noise: number;
}

const FULLY_UNKNOWN: DemoFogMaskCell = { unknown: 255, outOfSight: 0, noise: 0 };

function generateCells(model: WorldModel, bounds: MaskBounds): DemoFogMaskCell[] {
  const settlements = model.listSettlements();
  const cells = new Array<DemoFogMaskCell>(bounds.width * bounds.height);
  const indexOf = (texel: MaskTexel) => (texel.v - bounds.minV) * bounds.width + (texel.u - bounds.minU);

  const hexTexels: MaskTexel[] = [];
  for (let v = bounds.minV; v < bounds.maxV; v++) {
    for (let u = bounds.minU; u < bounds.maxU; u++) {
      const texel = { u, v };
      if (isHexTexel(texel)) hexTexels.push(texel);
    }
  }

  // Pass 1: real hexes, straight from WorldModel's own explored/visible state.
  for (const texel of hexTexels) {
    const hex = toHex(texel);
    const unknown = model.isExplored(hex.q, hex.r) ? 0 : ramp(model.distanceBeyondExplored(hex.q, hex.r), UNKNOWN_MARGIN_HEXES);
    const outOfSight = ramp(distanceBeyondVisible(model, settlements, hex), OUT_OF_SIGHT_MARGIN_HEXES);
    cells[indexOf(texel)] = { unknown, outOfSight, noise: noiseSeed(hex) };
  }

  // Pass 2: interpolation-only texels, averaged from their four diagonal hex
  // neighbours — an out-of-bounds neighbour (edge of DEMO_MASK_RADIUS) reads
  // as fully unknown rather than being skipped, matching the backend.
  for (let v = bounds.minV; v < bounds.maxV; v++) {
    for (let u = bounds.minU; u < bounds.maxU; u++) {
      const texel = { u, v };
      if (isHexTexel(texel)) continue;

      let unknownSum = 0;
      let outOfSightSum = 0;
      let noiseSum = 0;
      let count = 0;
      for (const neighbour of diagonalNeighboursForInterpolation(texel)) {
        const inBounds =
          neighbour.u >= bounds.minU && neighbour.u < bounds.maxU && neighbour.v >= bounds.minV && neighbour.v < bounds.maxV;
        const cell = inBounds ? cells[indexOf(neighbour)] : FULLY_UNKNOWN;
        unknownSum += cell.unknown;
        outOfSightSum += cell.outOfSight;
        noiseSum += cell.noise;
        count++;
      }
      cells[indexOf(texel)] = {
        unknown: Math.round(unknownSum / count),
        outOfSight: Math.round(outOfSightSum / count),
        noise: Math.round(noiseSum / count),
      };
    }
  }

  return cells;
}

/**
 * Bakes a fog mask bitmap for demo mode straight from `WorldModel`'s state
 * — see this module's own top comment. `null` once there's no settlement yet
 * (matches setFogMask's own "bitmap null is a no-op": nothing has been
 * founded, so there's nothing meaningful to reveal).
 */
export async function buildDemoFogMask(model: WorldModel): Promise<ImageBitmap | null> {
  if (model.listSettlements().length === 0) return null;

  const bounds = worldMaskBounds(DEMO_MASK_RADIUS);
  const cells = generateCells(model, bounds);

  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(bounds.width, bounds.height);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    image.data[i * 4 + 0] = cell.unknown;
    image.data[i * 4 + 1] = cell.outOfSight;
    image.data[i * 4 + 2] = cell.noise;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return createImageBitmap(blob);
}

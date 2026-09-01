// TS port of Bjarnoy.Domain.World.FogMaskLayout.WorldBounds (backend,
// src/backend/src/Bjarnoy.Domain/World/FogMaskLayout.cs) — just the bounds
// calculation, not the whole generator (see map-fog-v2.md §2.3's note on a
// golden-fixture-tested TS port; that's the fuller version this stops short
// of). The client needs this because the fog-mask PNG the backend serves
// carries no metadata of its own: its pixel dimensions imply `width`/
// `height`, but not where texel (0,0) sits in world space — that's exactly
// what `MinU`/`MinV` answer, and the backend derives them purely from the
// world's `radius`, which the client already has (`WorldResponse.radius`).
// As long as this stays byte-for-byte the same formula as the C# version,
// recomputing it here reconstructs the exact bounds the server used, with no
// extra request.
import type { AxialCoord } from '../../hex/coords';
import { axialToOddQ, hexesInRadius } from '../../hex/coords';

export interface MaskTexel {
  u: number;
  v: number;
}

export interface MaskBounds {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
  width: number;
  height: number;
}

/** Maps a hex onto its even-parity texel in doubled-row space — mirrors FogMaskLayout.ToTexel. */
export function toTexel(hex: AxialCoord): MaskTexel {
  const { col, row } = axialToOddQ(hex);
  return { u: col, v: 2 * row + (col & 1) };
}

/**
 * The whole-world texel bounding box for a world of the given `radius` —
 * mirrors FogMaskLayout.WorldBounds exactly, padding by one texel on every
 * side so every even-parity (real-hex) texel's odd-parity interpolation
 * neighbours are included too.
 */
export function worldMaskBounds(radius: number): MaskBounds {
  if (radius < 0) throw new RangeError('radius must not be negative');

  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;

  for (const hex of hexesInRadius({ q: 0, r: 0 }, radius)) {
    const { u, v } = toTexel(hex);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const boundsMinU = minU - 1;
  const boundsMinV = minV - 1;
  const boundsMaxU = maxU + 2;
  const boundsMaxV = maxV + 2;

  return {
    minU: boundsMinU,
    minV: boundsMinV,
    maxU: boundsMaxU,
    maxV: boundsMaxV,
    width: boundsMaxU - boundsMinU,
    height: boundsMaxV - boundsMinV,
  };
}

// TS port of Bjarnoy.Domain.World.FogMaskLayout (backend,
// src/backend/src/Bjarnoy.Domain/World/FogMaskLayout.cs) — the texel-space
// primitives, not the full FogMaskGenerator distance-transform (see
// map-fog-v2.md §2.3's note on a golden-fixture-tested TS port; that's the
// fuller version this stops short of). `demoFogMask.ts` uses `toHex`/
// `isHexTexel`/`diagonalNeighboursForInterpolation` to bake a mask directly
// from the client-side `WorldModel`'s own explored/visible state (no
// backend to fetch one from in demo mode); `worldMaskBounds` is also used to
// reconstruct where a *fetched* mask PNG sits in world space, since the PNG
// itself carries no metadata beyond its pixel dimensions and the backend
// derives `MinU`/`MinV` purely from the world's `radius`
// (`WorldResponse.radius`). As long as these stay byte-for-byte the same
// formulas as the C# version, this reconstructs exactly what the server
// would compute, with no extra request.
import type { AxialCoord } from '../../hex/coords';
import { axialToOddQ, hexesInRadius, oddQToAxial } from '../../hex/coords';
import type { FogMaskPlacement } from './FogMaskLayer';

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
 * Inverse of `toTexel` — mirrors FogMaskLayout.ToHex. Only meaningful for an
 * even-parity texel (`u + v` even); odd-parity texels are interpolation-only
 * and have no corresponding hex.
 */
export function toHex(texel: MaskTexel): AxialCoord {
  const col = texel.u;
  const row = (texel.v - (col & 1)) / 2;
  return oddQToAxial({ col, row });
}

/** Whether a texel lands on a real hex rather than an interpolation cell — mirrors FogMaskLayout.IsHexTexel. */
export function isHexTexel(texel: MaskTexel): boolean {
  return ((texel.u + texel.v) & 1) === 0;
}

/**
 * The four hexes diagonally surrounding an odd-parity interpolation texel —
 * mirrors FogMaskLayout.DiagonalNeighboursForInterpolation.
 */
export function diagonalNeighboursForInterpolation(texel: MaskTexel): MaskTexel[] {
  return [
    { u: texel.u - 1, v: texel.v },
    { u: texel.u + 1, v: texel.v },
    { u: texel.u, v: texel.v - 1 },
    { u: texel.u, v: texel.v + 1 },
  ];
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

/**
 * The world→mask-UV affine (map-fog-v2.md §2.1) for a world of the given
 * `radius`, given the renderer's tile dimensions.
 *
 * Two half-cell corrections that are easy to miss, both of which displace
 * the mask against the terrain it is supposed to be measuring:
 *
 * - `isoGridPosition` returns the **top-left of a hex's bounding box**, not
 *   its centre (see hex/geometry.ts) — the centre of column C sits at
 *   `C * colPitch + tileWidth / 2`. Mapping world coordinates straight
 *   through `worldX / colPitch` therefore lands a hex's *corner* on its own
 *   texel index, putting the hex centre 2/3 of a texel further along.
 * - A texture samples texel `i` at UV `(i + 0.5) / size`, not `i / size`, so
 *   the naive mapping is a further half-texel off on both axes.
 *
 * Netted out (2/3 − 1/2 = 1/6 of a texel in u, and 1 − 1/2 = 1/2 in v) the
 * uncorrected affine reads the mask about 21 world units right and
 * `tileHeight / 4` down of where the terrain actually is. Under the old
 * ten-hex airbrush that was invisible; against a shaped vision edge it is a
 * quarter-hex offset between the fog boundary and the ground it hides.
 */
export function fogMaskPlacement(radius: number, tileWidth: number, tileHeight: number): FogMaskPlacement {
  const bounds = worldMaskBounds(radius);
  return {
    scale: [1 / (0.75 * tileWidth * bounds.width), 2 / (tileHeight * bounds.height)],
    offset: [(-bounds.minU - 1 / 6) / bounds.width, (-bounds.minV - 0.5) / bounds.height],
  };
}

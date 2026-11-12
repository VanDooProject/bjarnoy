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
import { hexEuclideanDistance, hexesInRadius, neighbors } from '../../hex/coords';
import { FOG_SCOUT_RING } from '../WorldModel';
import type { WorldModel } from '../WorldModel';
import {
  diagonalNeighboursForInterpolation,
  isHexTexel,
  toHex,
  toTexel,
  maskBounds,
  type MaskBounds,
  type MaskTexel,
} from './fogMaskLayout';
import { FogCoverage } from './fogCoverage';
import { ARMY_FOG_WHITE_MARGIN, ARMY_FOG_WHITE_OFFSET, UNKNOWN_RAMP_MARGIN_HEXES } from './fogRamp';

// Mirrors FogMaskOptions' defaults (UnknownMarginHexes / OutOfSightMarginHexes); the unknown ramp's width is the one shared
// UNKNOWN_RAMP_MARGIN_HEXES (fogRamp.ts), see FogMaskOptions.UnknownMarginHexes for why a mismatch is silent rather than an error.
const UNKNOWN_MARGIN_HEXES = UNKNOWN_RAMP_MARGIN_HEXES;
const OUT_OF_SIGHT_MARGIN_HEXES = 2;

// Demo worlds are procedurally generated on demand and their islands are far apart (the nearest
// one to the origin can be hundreds of hexes away), so the demo mask is not a fixed disc around the
// origin: it is a texel window around the demo settlements' explored reach (`demoMaskBounds`), the
// same chunk-window placement (`fogMaskPlacement(bounds, ...)`) a live world's stitched mask uses.
// Ground outside the window just reads as "never scouted" (the shader's own out-of-bounds handling,
// fogShader.ts's sampleMask), never a leak or crash.

/** Hexes of slack around the explored reach: the unknown-ramp margin plus room for growth. */
const WINDOW_SLACK_HEXES = UNKNOWN_MARGIN_HEXES + 6;

/**
 * The texel window the demo mask covers: every settlement's explored radius (towers included) plus
 * the ramp margin, as one bounding rectangle. With `u = q` and `v = 2r + q`, a hex disc of radius R
 * around `(q, r)` spans `u in [q - R, q + R]` and `v in [2r + q - 2R, 2r + q + 2R]`, padded by one
 * texel like `worldMaskBounds`.
 */
export function demoMaskBounds(model: WorldModel): MaskBounds {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const s of model.listSettlements()) {
    const R = model.exploredRadius(s) + WINDOW_SLACK_HEXES;
    const centreV = 2 * s.r + s.q;
    minU = Math.min(minU, s.q - R - 1);
    maxU = Math.max(maxU, s.q + R + 2);
    minV = Math.min(minV, centreV - 2 * R - 1);
    maxV = Math.max(maxV, centreV + 2 * R + 2);
  }
  // No settlement yet: an empty window (buildDemoFogMask bakes nothing then anyway).
  if (minU === Infinity) return maskBounds(0, 0, 1, 1);
  return maskBounds(minU, minV, maxU, maxV);
}

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

/**
 * Distance past the nearest source's ring, measured with the *round* metric
 * (`hexEuclideanDistance`) rather than `hexDistance`.
 *
 * This is what makes the fog's contours circles instead of hexagons — see
 * that function's own comment for why a hexDistance field can't produce a
 * round edge no matter how much noise is thrown at it downstream. Mirrors
 * the backend generator's RingDistance; the two have to agree or the live
 * and demo fog are different shapes.
 *
 * Radii stay in hexes, as everywhere else. That is not a unit mismatch: the
 * ring's own hexes all sit at euclidean distance <= their hex radius, so the
 * 0 contour still encloses every hex the ring contains, and the ramp beyond
 * it is round.
 */
function ringDistance(sources: Array<{ q: number; r: number; radius: number }>, hex: AxialCoord): number {
  let min = Infinity;
  for (const source of sources) {
    const d = hexEuclideanDistance({ q: source.q, r: source.r }, hex) - source.radius;
    if (d < min) min = d;
  }
  return min === Infinity ? Infinity : Math.max(0, min);
}

const STEPS_PER_EUCLIDEAN_UNIT = 2 / Math.sqrt(3);
const TRAIL_FRINGE_CAP_HEXES = ARMY_FOG_WHITE_OFFSET + ARMY_FOG_WHITE_MARGIN;
/** Step radius from an explored hex to the farthest hex its fringe can change (mirrors FogMaskGenerator.TrailFringeReachSteps). */
export const TRAIL_FRINGE_REACH_STEPS = Math.ceil(TRAIL_FRINGE_CAP_HEXES * STEPS_PER_EUCLIDEAN_UNIT);

/** The troop's white ramp as a 0..255 value for a distance from explored ground. */
function trailRamp(distance: number): number {
  if (!Number.isFinite(distance)) return 255;
  const t = Math.min(1, Math.max(0, (distance - ARMY_FOG_WHITE_OFFSET) / ARMY_FOG_WHITE_MARGIN));
  return Math.round(255 * t);
}

/**
 * Per hex texel index within reach of explored ground, the euclidean distance to the nearest explored hex. Only explored
 * hexes with an unexplored neighbour can be nearest, so only those are stamped; they may lie outside the bounds (up to
 * the fringe reach). Mirrors FogMaskGenerator.TrailFringeDistances.
 */
function trailFringeDistances(
  bounds: MaskBounds,
  isExplored: (q: number, r: number) => boolean,
  indexOf: (texel: MaskTexel) => number,
): Map<number, number> {
  const distance = new Map<number, number>();
  const steps = TRAIL_FRINGE_REACH_STEPS;
  const cache = new Map<string, boolean>();
  const explored = (q: number, r: number): boolean => {
    const k = `${q},${r}`;
    let value = cache.get(k);
    if (value === undefined) {
      value = isExplored(q, r);
      cache.set(k, value);
    }
    return value;
  };

  for (let v = bounds.minV - 2 * steps; v < bounds.maxV + 2 * steps; v++) {
    for (let u = bounds.minU - steps; u < bounds.maxU + steps; u++) {
      const texel = { u, v };
      if (!isHexTexel(texel)) continue;
      const hex = toHex(texel);
      if (!explored(hex.q, hex.r) || !neighbors(hex).some((n) => !explored(n.q, n.r))) continue;
      for (const target of hexesInRadius(hex, steps)) {
        const targetTexel = toTexel(target);
        if (
          targetTexel.u < bounds.minU ||
          targetTexel.u >= bounds.maxU ||
          targetTexel.v < bounds.minV ||
          targetTexel.v >= bounds.maxV
        ) {
          continue;
        }
        const d = hexEuclideanDistance(target, hex);
        if (d > TRAIL_FRINGE_CAP_HEXES) continue;
        const i = indexOf(targetTexel);
        const existing = distance.get(i);
        if (existing === undefined || d < existing) distance.set(i, d);
      }
    }
  }
  return distance;
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

  // One source per vision disc (the settlement's own centre plus one per
  // standing Tower — WorldModel.visionDiscsFor), not one per settlement,
  // so a Tower actually pushes back the fog around itself instead of only
  // widening its settlement's territory — mirrors the backend's own
  // FogMaskService, which adds one FogVisionSource per Tower alongside each
  // settlement's own.
  const exploredSources = settlements.flatMap((s) =>
    model.visionDiscsFor(s).map((d) => ({ q: d.q, r: d.r, radius: d.radius + FOG_SCOUT_RING })),
  );
  const visibleSources = settlements.flatMap((s) =>
    model.visionDiscsFor(s).map((d) => ({ q: d.q, r: d.r, radius: d.radius + 1 })),
  );

  const trailDistance = trailFringeDistances(bounds, (q, r) => model.isExplored(q, r), indexOf);

  // Pass 1: real hexes. `isExplored` still gates the unknown channel — that
  // is WorldModel's own monotonic explored set (hex-counted, as gameplay
  // reach always is), and no rendering metric should be able to fog a hex
  // the player has actually scouted. Only the *ramp past* it is round. Beside explored ground the source ramp
  // is capped by the troop's own ramp (the trail fringe), so explored history has no hard edge.
  for (const texel of hexTexels) {
    const hex = toHex(texel);
    const unknown = model.isExplored(hex.q, hex.r)
      ? 0
      : Math.min(
          ramp(ringDistance(exploredSources, hex), UNKNOWN_MARGIN_HEXES),
          trailRamp(trailDistance.get(indexOf(texel)) ?? Infinity),
        );
    const outOfSight = ramp(ringDistance(visibleSources, hex), OUT_OF_SIGHT_MARGIN_HEXES);
    cells[indexOf(texel)] = { unknown, outOfSight, noise: noiseSeed(hex) };
  }

  // Pass 2: interpolation-only texels, averaged from their four diagonal hex
  // neighbours — an out-of-bounds neighbour (edge of the window) reads
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
 * — see this module's own top comment — together with the `FogCoverage` of the same pixels. `null` once there's no settlement yet
 * (matches setFogMask's own "bitmap null is a no-op": nothing has been
 * founded, so there's nothing meaningful to reveal).
 */
export async function buildDemoFogMask(
  model: WorldModel,
  bounds: MaskBounds = demoMaskBounds(model),
): Promise<{ bitmap: ImageBitmap; coverage: FogCoverage } | null> {
  if (model.listSettlements().length === 0) return null;

  const cells = generateCells(model, bounds);

  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    data[i * 4 + 0] = cell.unknown;
    data[i * 4 + 1] = cell.outOfSight;
    data[i * 4 + 2] = cell.noise;
    data[i * 4 + 3] = 255;
  }
  const coverage = new FogCoverage(bounds, data);
  const image = new ImageData(data, bounds.width, bounds.height);
  return { bitmap: await createImageBitmap(image), coverage };
}

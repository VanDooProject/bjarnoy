// The water mask — docs/design/water-shader.md §2.
//
// Both effects this feature adds are functions of one quantity: how far is
// this pixel from land. Foam is a band at small distances; mid-water waves are
// suppressed at small ones (today's per-hex `isNearLand` cull, but continuous).
// So the shader needs a distance field, and that means a CPU-baked data
// texture — the same shape of thing `demoFogMask` bakes, over a different
// grid (waterMaskLayout.ts) and with a different transform.
import { hexesInRadius } from '../../hex/coords';
import { isoGridPosition, isoPixelToAxial, isoTopPoints } from '../../hex/geometry';
import type { Tile } from '../types';
import type { WaterMaskRegion } from './waterMaskLayout';

/**
 * The subset of `WorldModel` the bake needs — the same narrow interface
 * `shoreline.ts` already declares, and for the same reason: terrain is
 * deterministic from the world seed on the client, so this needs no backend
 * round trip and tests can pass a plain object.
 */
export interface TerrainLookup {
  isLand(q: number, r: number): boolean;
  /**
   * The whole tile, when the caller has one — only used to spot the coastal
   * water variants that carry a prop (`hasWaterProp`). Optional so a test can
   * still pass a bare `isLand`, and because a caller that omits it gets a mask
   * whose A channel is simply all zero: no prop tiles, nothing muted.
   */
  getTile?(q: number, r: number): Tile;
}

/**
 * How far out from land the R channel ramps, in tile widths. Well past the
 * foam band itself: R also drives §4.2's wave coast-fade, which needs headroom
 * beyond the foam to fade the crests in over.
 */
export const FOAM_REACH_TILES = 1.5;

/**
 * Half-range of the mask's **signed** near field, in tile widths — R stores
 * `0.5 + d / (2 * NEAR_SPAN_TILES)`, so 0.5 is exactly the coastline, below it
 * is land and above it is water.
 *
 * One signed channel rather than an unsigned distance per side plus a coverage
 * bit, because the coverage bit was the thing wrecking the foam's inner edge.
 * A 0/255 step sampled with linear filtering is a *texel-quantised* silhouette:
 * whichever side of 0.5 a pixel lands on is decided by the texel raster, not by
 * the hexagon the art actually draws, so the band alternately overlapped the
 * sand by several pixels and left a sliver of bare water between itself and the
 * shore, stair-stepping along every diagonal. A signed field has no such
 * decision in it — it is continuous across the boundary, so its zero crossing
 * lands within a fraction of a texel of the true tile edge, and interpolation
 * *helps* rather than blurring a silhouette.
 *
 * 0.6 tiles either way spends the byte where the foam is: about 0.8 world units
 * per level, against the ~2 a single channel spanning the full FOAM_REACH would
 * give.
 */
export const NEAR_SPAN_TILES = 0.6;

/**
 * How far past a prop tile's own hex the shader mute fades out, in tile widths.
 *
 * The mute exists because two of the three `coastalwatertile_*` variants aren't
 * plain water: `variant000` paints a beached boat and `variant001` a rock, both
 * lit and shaded as solid objects sitting *in* the water. Animated foam and
 * caustic ribbons drawn flat across them read as painted onto the object rather
 * than flowing around it, which is exactly the illusion the props are there to
 * create.
 *
 * Faded rather than switched. A per-hex boolean would cut the foam collar off
 * at a hexagon edge, and a hexagonal hole in a coastline is far more visible
 * than either the prop or the foam — the same failure mode `isNearLand` has in
 * the wave field, and the reason §4.2's coast fade is continuous too.
 *
 * 0.2 tiles, cut back from 0.4: measured on screen, the longer ramp left 30% of
 * one island's coastline at muted width and another 31% part-way, because a
 * single prop reaches over 1.8 hex edges of coast. A fifth of a tile is still
 * several mask texels, which is all the ramp needs to not read as an edge.
 */
export const PROP_MUTE_FADE_TILES = 0.2;

/**
 * Whether a tile renders with one of the coastal-water props, and so wants the
 * shader muted over it.
 *
 * The conditions are `baseTextureFor`'s, because that is what decides which art
 * actually gets drawn: only sea, only coastal water, only without a building on
 * it (a fishing hut or dockyard replaces the coastal tile with its own art, so
 * there is no prop to protect), and only a non-zero variant — index 0 is the
 * plain coastal tile, which `worldGenerator`'s weights make 80% of the coast.
 */
export function hasWaterProp(tile: Tile): boolean {
  return tile.terrain === 'sea' && !!tile.isCoastalWater && !tile.buildingType && (tile.variant ?? 0) > 0;
}

export interface WaterMask {
  /** RGBA8, `width * height * 4`. R: signed near distance (0.5 = coastline). G: far distance from land. B: per-hex seed. A: prop-tile shader mute (§4.4). */
  data: Uint8Array;
  width: number;
  height: number;
  region: WaterMaskRegion;
}

const EDT_INF = 1e20;

/**
 * How far out the exact hex-edge distance below is computed, in hexes. Three
 * covers FOAM_REACH_TILES with room to spare; past it the raster transform's
 * value is used, and since R saturates at 1.5 tiles there is no seam where the
 * two meet.
 */
const MITRE_REFINE_HEXES = 3;

/**
 * How much the isometric projection squashes the ground plane vertically.
 *
 * A regular flat-top hexagon of width `w` is `w * sqrt(3)/2` tall; the tile art
 * draws it `TILE_H` tall, which is 0.46 `w`. So the ground is foreshortened to
 * about 53% in y, and anything that is supposed to *lie on* that ground —
 * a foam band of constant width, a caustic ribbon — has to be built in a space
 * where y is divided by this before it will look like it is lying on it rather
 * than painted on the glass in front of it.
 */
export function groundSquash(tileWidth: number, tileHeight: number): number {
  return tileHeight / ((tileWidth * Math.sqrt(3)) / 2);
}

export interface HalfPlane {
  nx: number;
  ny: number;
  /** Dot of the normal with a point on the edge — the plane's own offset. */
  d: number;
}

/**
 * The six outward half-planes of a top-face hexagon **in ground space**,
 * relative to a hex's grid position. Identical for every hex, so computed once
 * per bake.
 *
 * Ground space is screen space with y divided by `groundSquash`, which
 * un-foreshortens the isometric projection — so in it the top face is a regular
 * hexagon and a distance is a real distance along the ground.
 */
export function topFaceHalfPlanes(tileWidth: number, tileHeight: number): HalfPlane[] {
  const points = isoTopPoints(tileWidth, tileHeight / groundSquash(tileWidth, tileHeight));
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    // isoTopPoints runs clockwise in screen space (y down), so (ey, -ex) points
    // out of the hexagon.
    const nx = ey / length;
    const ny = -ex / length;
    return { nx, ny, d: nx * a.x + ny * a.y };
  });
}

/**
 * Distance from a world point to one hex's top face, as the **max over its six
 * outward half-planes** — negative inside, positive outside.
 *
 * This is a mitre distance, not a euclidean one, and that is the entire point.
 * A euclidean distance field rounds every convex corner over a radius equal to
 * the band drawn from it, and a hex edge is only half a tile long while the foam
 * band is a third of one — so on a hex coastline the corners dominate and a
 * euclidean band reads as a soft blob rather than as something following the
 * shoreline. Level sets of this are the hexagon scaled outward with the corners
 * kept sharp, so a band drawn from it has straight edges parallel to the tile
 * edges and mitred joins, which is what the shoreline actually looks like.
 *
 * It agrees with the euclidean distance exactly along every edge (both are the
 * perpendicular distance there) and is zero on the edge itself, so §3.4's
 * mask/art alignment is unaffected — if anything it is sharper, since this is
 * exact at every texel rather than quantised to the texel raster.
 */
export function hexMitreDistance(x: number, y: number, originX: number, originY: number, planes: HalfPlane[]): number {
  let best = -Infinity;
  for (const plane of planes) {
    const value = plane.nx * (x - originX) + plane.ny * (y - originY) - plane.d;
    if (value > best) best = value;
  }
  return best;
}

/**
 * Felzenszwalb & Huttenlocher's exact 1D squared-distance transform:
 * `d[q] = min over p of (q - p)^2 + f[p]`, in O(n).
 *
 * Exact, rather than the 3-4 chamfer the spike used. That is not a
 * gold-plating: a chamfer's error is *directional* (it is cheapest along the
 * eight directions its weights encode), and the spike showed it as faint
 * radial streaks fanning out from the coast — visible in the foam band, which
 * is where the whole effect lives. §11 records that as the reason not to treat
 * this as an optimisation to skip.
 *
 * `f` uses EDT_INF rather than Infinity for the non-seed cost so the parabola
 * intersection below stays finite: with two infinite costs the numerator would
 * be Infinity - Infinity = NaN, and the whole scanline would collapse.
 */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array, curvature = 1): void {
  // The parabolas are `curvature * (p - q)^2 + f(q)` rather than the textbook's
  // unit-curvature ones, so a step along this axis can be worth more or less
  // than a step along the other — which is how the transform ends up measuring
  // ground distance on an axis that the isometric projection foreshortens. The
  // intersection formula picks up the same factor; with curvature 1 it is the
  // textbook algorithm unchanged.
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  const intersect = (q: number, w: number) =>
    (f[q] + curvature * q * q - (f[w] + curvature * w * w)) / (2 * curvature * (q - w));
  for (let q = 1; q < n; q++) {
    let s = intersect(q, v[k]);
    while (s <= z[k]) {
      k--;
      s = intersect(q, v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = curvature * (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Exact euclidean distance, in texels, from every cell to the nearest cell
 * with `seeds[i] !== 0`. Separable: `edt1d` down every column, then across
 * every row of the result.
 */
export function euclideanDistanceTransform(seeds: Uint8Array, width: number, height: number, yCurvature = 1): Float32Array {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const squared = new Float64Array(width * height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = seeds[y * width + x] ? 0 : EDT_INF;
    edt1d(f, height, d, v, z, yCurvature);
    for (let y = 0; y < height; y++) squared[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = squared[row + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) squared[row + x] = d[x];
  }

  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(squared[i]);
  return out;
}

/**
 * The prop-tile mute ramp: 1 on the prop hex itself, smoothly to 0 `fade` world
 * units outside it.
 *
 * Smoothstep rather than a linear ramp so the *rate* of the fade also goes to
 * zero at its far end — a linear ramp meets the unmuted water at a corner, and
 * a corner in a multiplier applied to a bright foam band is visible as a ring
 * even though the value itself is continuous there.
 */
export function propMute(distance: number, fade: number): number {
  if (distance <= 0) return 1;
  if (distance >= fade) return 0;
  const t = distance / fade;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Deterministic per-hex pseudo-random seed for the shader's foam ruggedness
 * and wave phase — the same hash `demoFogMask`'s `noiseSeed` uses, and for the
 * same reason: it is only ever sampled locally, never compared against a
 * server-baked value.
 */
export function waterNoiseSeed(q: number, r: number): number {
  let h = (Math.imul(q, 374761393) ^ Math.imul(r, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 0xff;
}

/**
 * Bakes the mask over `region`.
 *
 * The world -> hex step goes through **`isoPixelToAxial`**, and not through
 * anything derived from sprite bounds. That is the single load-bearing choice
 * in this file (§2.3/§3.4): `isoPixelToAxial` is defined in terms of the
 * `isoTopPoints` top-face hexagon, which abuts its neighbours with no gaps or
 * overlaps — and because top faces tessellate exactly, a tile's 68px skirt is
 * always covered by the tile in front of it, so the *visible* land/water
 * boundary in the art falls on precisely that same polygon edge. Mask and art
 * therefore agree by construction, with no offset term anywhere. Bake from
 * sprite extents instead and every boundary shifts by up to 68 world units,
 * detaching the foam from the coastline it is supposed to be tracing.
 */
export function bakeWaterMask(region: WaterMaskRegion, tileWidth: number, tileHeight: number, terrain: TerrainLookup): WaterMask {
  const { width, height, texelWorldSize, rect } = region;
  const count = width * height;
  const water = new Uint8Array(count);
  const land = new Uint8Array(count);
  const seed = new Uint8Array(count);
  const prop = new Uint8Array(count);
  let propTexels = 0;

  // One `isoPixelToAxial` per texel is the bake's whole cost. It is a rounded
  // estimate plus at most seven point-in-hexagon tests, and at 1024^2 in the
  // clamped worst case that is the number `waterMaskBakeMs` reports.
  for (let y = 0; y < height; y++) {
    const wy = rect.minY + (y + 0.5) * texelWorldSize;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const wx = rect.minX + (x + 0.5) * texelWorldSize;
      const hex = isoPixelToAxial({ x: wx, y: wy }, tileWidth, tileHeight);
      const isLand = terrain.isLand(hex.q, hex.r);
      land[row + x] = isLand ? 1 : 0;
      water[row + x] = isLand ? 0 : 1;
      seed[row + x] = waterNoiseSeed(hex.q, hex.r);
      if (!isLand && terrain.getTile && hasWaterProp(terrain.getTile(hex.q, hex.r))) {
        prop[row + x] = 1;
        propTexels++;
      }
    }
  }

  // The raster transform gives every texel a distance cheaply. Near a coast it
  // is then replaced by the exact hex-edge distance below — that is where the
  // shader actually reads the field, and where a euclidean metric's rounded
  // corners are visible.
  const squash = groundSquash(tileWidth, tileHeight);
  // Ground space, not screen space: a step in y covers 1/squash as much ground
  // as a step in x, so the transform has to weight it that way. Baked flat, the
  // far field is a distance *on the glass* — which puts its level sets 1.9x
  // further out on a north-facing shore than an east-facing one, measured on the
  // ground. Everything else in this file is already in ground space (§2.3); this
  // channel was the last thing that wasn't, and the caustics' keep-off distance
  // reads it.
  const yCurvature = 1 / (squash * squash);
  const distanceFromLand = euclideanDistanceTransform(land, width, height, yCurvature);
  const distanceFromWater = euclideanDistanceTransform(water, width, height, yCurvature);

  const planes = topFaceHalfPlanes(tileWidth, tileHeight);
  // A little past the signed field's own span: past that it is saturated and
  // the exact value cannot change what is drawn.
  const refineWithin = (NEAR_SPAN_TILES + 0.2) * tileWidth;
  const disc = hexesInRadius({ q: 0, r: 0 }, MITRE_REFINE_HEXES);

  const reachWorld = FOAM_REACH_TILES * tileWidth;
  const nearSpanWorld = NEAR_SPAN_TILES * tileWidth;

  // Distance out of the prop hexes, for the A channel's mute ramp. The same
  // transform the distance field itself uses, so this is one extra O(n) pass —
  // and skipped outright on the common region with no prop tile in it, which is
  // most of them (only ~20% of coastal hexes carry a prop, and coastal hexes
  // are a thin set to begin with).
  const distanceFromProp = propTexels > 0 ? euclideanDistanceTransform(prop, width, height, yCurvature) : null;
  const propFadeWorld = PROP_MUTE_FADE_TILES * tileWidth;

  const data = new Uint8Array(count * 4);
  for (let y = 0; y < height; y++) {
    const wy = rect.minY + (y + 0.5) * texelWorldSize;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const isWater = water[i] === 1;
      const rasterOutward = distanceFromLand[i] * texelWorldSize;
      const rasterInward = distanceFromWater[i] * texelWorldSize;

      // Only texels near a coast pay for the exact metric: further out the
      // signed channel is saturated and the far channel is all the shader
      // reads, so on a large zoomed-out world map this loop is skipped for
      // almost every texel.
      let near = isWater ? rasterOutward : -rasterInward;
      if (Math.abs(near) < refineWithin) {
        const wx = rect.minX + (x + 0.5) * texelWorldSize;
        const hex = isoPixelToAxial({ x: wx, y: wy }, tileWidth, tileHeight);
        let best = Infinity;
        for (const offset of disc) {
          const q = hex.q + offset.q;
          const r = hex.r + offset.r;
          if (terrain.isLand(q, r) === isWater) {
            const origin = isoGridPosition({ q, r }, tileWidth, tileHeight);
            // Both the sample point and the hex are lifted into ground space,
            // so the resulting band is a constant width *on the ground* and
            // therefore reads as lying on it.
            const d = hexMitreDistance(wx, wy / squash, origin.x, origin.y / squash, planes);
            if (d < best) best = d;
          }
        }
        // Distance to the nearest hex of the opposite kind is the distance to
        // the coastline from either side, and it goes to zero on the shared
        // edge from both — which is what makes the signed field continuous.
        if (best !== Infinity) near = isWater ? Math.max(0, best) : -Math.max(0, best);
      }

      data[i * 4 + 0] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + near / (2 * nearSpanWorld))));
      data[i * 4 + 1] = Math.round(255 * Math.min(1, rasterOutward / reachWorld));
      data[i * 4 + 2] = seed[i];
      data[i * 4 + 3] = distanceFromProp === null ? 0 : Math.round(255 * propMute(distanceFromProp[i] * texelWorldSize, propFadeWorld));
    }
  }
  return { data, width, height, region };
}

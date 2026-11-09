import { hexEuclideanDistance } from '../../hex/coords';
import { FOG_SCOUT_RING } from '../WorldModel';
import { diagonalNeighboursForInterpolation, isHexTexel, toHex, maskBounds, } from './fogMaskLayout';
import { FogCoverage } from './fogCoverage';
// Mirrors FogMaskOptions' defaults (UnknownMarginHexes / OutOfSightMarginHexes)
// — UNKNOWN_MARGIN_HEXES also matches HexMapRenderer's own
// FOG_RAMP_MARGIN_HEXES. All three describe the same ramp and have to move
// together; see FogMaskOptions.UnknownMarginHexes for why a mismatch is
// silent rather than an error.
const UNKNOWN_MARGIN_HEXES = 14;
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
export function demoMaskBounds(model) {
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
    if (minU === Infinity)
        return maskBounds(0, 0, 1, 1);
    return maskBounds(minU, minV, maxU, maxV);
}
function ramp(distance, marginHexes) {
    if (!Number.isFinite(distance))
        return 255;
    if (distance <= 0)
        return 0;
    if (marginHexes <= 0 || distance >= marginHexes)
        return 255;
    return Math.round((255 * distance) / marginHexes);
}
// Deterministic per-hex pseudo-random seed for the shader's UV warp
// (fogShader.ts). Doesn't need to match the backend's exact byte values —
// unlike the mask's fog channels, this is never compared across client and
// server, only sampled locally.
function noiseSeed(hex) {
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
function ringDistance(sources, hex) {
    let min = Infinity;
    for (const source of sources) {
        const d = hexEuclideanDistance({ q: source.q, r: source.r }, hex) - source.radius;
        if (d < min)
            min = d;
    }
    return min === Infinity ? Infinity : Math.max(0, min);
}
const FULLY_UNKNOWN = { unknown: 255, outOfSight: 0, noise: 0 };
function generateCells(model, bounds) {
    const settlements = model.listSettlements();
    const cells = new Array(bounds.width * bounds.height);
    const indexOf = (texel) => (texel.v - bounds.minV) * bounds.width + (texel.u - bounds.minU);
    const hexTexels = [];
    for (let v = bounds.minV; v < bounds.maxV; v++) {
        for (let u = bounds.minU; u < bounds.maxU; u++) {
            const texel = { u, v };
            if (isHexTexel(texel))
                hexTexels.push(texel);
        }
    }
    // One source per vision disc (the settlement's own centre plus one per
    // standing Tower — WorldModel.visionDiscsFor), not one per settlement,
    // so a Tower actually pushes back the fog around itself instead of only
    // widening its settlement's territory — mirrors the backend's own
    // FogMaskService, which adds one FogVisionSource per Tower alongside each
    // settlement's own.
    const exploredSources = settlements.flatMap((s) => model.visionDiscsFor(s).map((d) => ({ q: d.q, r: d.r, radius: d.radius + FOG_SCOUT_RING })));
    const visibleSources = settlements.flatMap((s) => model.visionDiscsFor(s).map((d) => ({ q: d.q, r: d.r, radius: d.radius + 1 })));
    // Pass 1: real hexes. `isExplored` still gates the unknown channel — that
    // is WorldModel's own monotonic explored set (hex-counted, as gameplay
    // reach always is), and no rendering metric should be able to fog a hex
    // the player has actually scouted. Only the *ramp past* it is round.
    for (const texel of hexTexels) {
        const hex = toHex(texel);
        const unknown = model.isExplored(hex.q, hex.r) ? 0 : ramp(ringDistance(exploredSources, hex), UNKNOWN_MARGIN_HEXES);
        const outOfSight = ramp(ringDistance(visibleSources, hex), OUT_OF_SIGHT_MARGIN_HEXES);
        cells[indexOf(texel)] = { unknown, outOfSight, noise: noiseSeed(hex) };
    }
    // Pass 2: interpolation-only texels, averaged from their four diagonal hex
    // neighbours — an out-of-bounds neighbour (edge of the window) reads
    // as fully unknown rather than being skipped, matching the backend.
    for (let v = bounds.minV; v < bounds.maxV; v++) {
        for (let u = bounds.minU; u < bounds.maxU; u++) {
            const texel = { u, v };
            if (isHexTexel(texel))
                continue;
            let unknownSum = 0;
            let outOfSightSum = 0;
            let noiseSum = 0;
            let count = 0;
            for (const neighbour of diagonalNeighboursForInterpolation(texel)) {
                const inBounds = neighbour.u >= bounds.minU && neighbour.u < bounds.maxU && neighbour.v >= bounds.minV && neighbour.v < bounds.maxV;
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
export async function buildDemoFogMask(model, bounds = demoMaskBounds(model)) {
    if (model.listSettlements().length === 0)
        return null;
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

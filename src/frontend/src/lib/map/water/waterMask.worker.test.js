// isLandFor is the water-mask bake worker's own land check — it has no live
// connection to WorldModel, so a wasted-island reveal has to reach it
// through the explicit `wastedRevealed` flag on every BakeRequest (see
// HexMapRenderer.maybeBakeWaterMask, which re-sends it on every bake and
// forces a rebake whenever it flips). This mirrors WorldModel.terrainOf's
// own reveal fall-through, checked directly here since a real Worker needs
// a browser/worker global this repo's node-environment vitest config
// doesn't provide.
import { describe, expect, it } from 'vitest';
import { isLandFor, isWastedLandFor, withLandHexes } from './waterMask.worker';
import { WorldModel, terrainKey } from '../WorldModel';
import { waterMaskTerrainFor } from '../HexMapRenderer';
import { DEFAULT_GENERATION } from '../worldGenerator';
import { nearestLand } from '../testing/islandFinders';
describe('isLandFor (water-mask bake worker)', () => {
    // Seed 40 — the same seed and hexes as
    // WorldModel.test.ts's own wasted-island reveal suite. (-81, 256) is a
    // wasted-forest hex; (-83, 256) is plain open sea bordering wasted land.
    const WASTED_SEED = 40;
    const wastedLand = { q: -81, r: 256 };
    const plainSea = { q: -83, r: 256 };
    it('treats a wasted hex as sea while not revealed', () => {
        const isLand = isLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(isLand(wastedLand.q, wastedLand.r)).toBe(false);
    });
    it('treats a wasted hex as land once revealed', () => {
        const isLand = isLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        expect(isLand(wastedLand.q, wastedLand.r)).toBe(true);
    });
    it('never calls a green-sea hex land, revealed or not', () => {
        const revealed = isLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        const hidden = isLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(revealed(plainSea.q, plainSea.r)).toBe(false);
        expect(hidden(plainSea.q, plainSea.r)).toBe(false);
    });
    it('does not cache a stale answer across a reveal flip for the same seed', () => {
        // Same pattern the worker's own module-level cache actually hits: two
        // calls for the same seed, the first before reveal, the second after.
        const hidden = isLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(hidden(wastedLand.q, wastedLand.r)).toBe(false);
        const revealed = isLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        expect(revealed(wastedLand.q, wastedLand.r)).toBe(true);
        const hiddenAgain = isLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(hiddenAgain(wastedLand.q, wastedLand.r)).toBe(false);
    });
});
describe('isWastedLandFor (water-mask taint field)', () => {
    // Same seed and hexes as isLandFor's suite above — see its own comment.
    const WASTED_SEED = 40;
    const wastedLand = { q: -81, r: 256 };
    const plainSea = { q: -83, r: 256 };
    it('answers false for a wasted hex while not revealed', () => {
        const isWastedLand = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(isWastedLand(wastedLand.q, wastedLand.r)).toBe(false);
    });
    it('answers true for a wasted hex once revealed', () => {
        const isWastedLand = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        expect(isWastedLand(wastedLand.q, wastedLand.r)).toBe(true);
    });
    it('never calls a plain green-sea hex wasted land, revealed or not', () => {
        // The whole point of the narrower check: isLandFor would call this hex
        // land once its own wasted-bordering coastal water kicks in, but it is
        // not itself wasted land, so the taint field must not seed here.
        const revealed = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        const hidden = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(revealed(plainSea.q, plainSea.r)).toBe(false);
        expect(hidden(plainSea.q, plainSea.r)).toBe(false);
    });
    it('never calls plain green land wasted land', () => {
        // A hex the green layer already calls land (not sea) must never answer
        // true here — isWastedLand means "land *only* because of the wasted
        // layer", not "land at all". Found by scanning outward from the origin
        // for this seed rather than hardcoded, so the test does not depend on
        // exactly which nearby hex the generator happens to call land.
        const world = { seed: WASTED_SEED, generation: DEFAULT_GENERATION };
        const greenLand = nearestLand(world, { q: 0, r: 0 });
        expect(greenLand).not.toBeNull();
        const isWastedLand = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        expect(isWastedLand(greenLand.q, greenLand.r)).toBe(false);
    });
    it('does not cache a stale answer across a reveal flip for the same seed', () => {
        const hidden = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(hidden(wastedLand.q, wastedLand.r)).toBe(false);
        const revealed = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, true);
        expect(revealed(wastedLand.q, wastedLand.r)).toBe(true);
        const hiddenAgain = isWastedLandFor(WASTED_SEED, DEFAULT_GENERATION, false);
        expect(hiddenAgain(wastedLand.q, wastedLand.r)).toBe(false);
    });
});
describe('the bake worker and the inline bake agree on pocket lakes', () => {
    // A pocket lake is an enclosed sea pocket the bog turned into lake water (`bogGenerator.findPockets`): the seed still
    // calls its hexes sea. The worker only knows the seed, so without `landHexes` it baked them as sea and drew the shore
    // foam around the lake, while the inline bake (`waterMaskTerrainFor`, through the bog overlay) called them land.
    const seed = 40;
    const sea = { q: -83, r: 256 };
    const bogTile = (c, kind) => ({
        ...c,
        kind,
        inDirections: [],
        outDirection: null,
        waterEdges: [],
    });
    it('bakes a lake on a seed-sea hex as land on both paths', () => {
        const model = new WorldModel(seed);
        const land = nearestLand({ seed, generation: model.generation }, { q: 0, r: 0 });
        model.setBogTiles([bogTile(sea, 'lake'), bogTile(land, 'bog')]);
        const worker = withLandHexes(isLandFor(seed, model.generation, false), model.seaBogHexKeys());
        const inline = waterMaskTerrainFor(model).isLand;
        expect(isLandFor(seed, model.generation, false)(sea.q, sea.r)).toBe(false);
        expect(inline(sea.q, sea.r)).toBe(true);
        expect(worker(sea.q, sea.r)).toBe(true);
        expect(worker(land.q, land.r)).toBe(inline(land.q, land.r));
        // Only the hexes the seed gets wrong travel to the worker.
        expect(model.seaBogHexKeys()).toEqual([terrainKey(sea.q, sea.r)]);
    });
    it('moves the water mask revision when the bog arrives, so the mask is rebaked', () => {
        const model = new WorldModel(seed);
        const before = model.waterMaskRevision;
        model.setBogTiles([bogTile(sea, 'lake')]);
        expect(model.waterMaskRevision).not.toBe(before);
    });
});

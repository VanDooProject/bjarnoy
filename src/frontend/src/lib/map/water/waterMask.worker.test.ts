// isLandFor is the water-mask bake worker's own land check — it has no live
// connection to WorldModel, so a wasted-island reveal has to reach it
// through the explicit `wastedRevealed` flag on every BakeRequest (see
// HexMapRenderer.maybeBakeWaterMask, which re-sends it on every bake and
// forces a rebake whenever it flips). This mirrors WorldModel.terrainOf's
// own reveal fall-through, checked directly here since a real Worker needs
// a browser/worker global this repo's node-environment vitest config
// doesn't provide.
import { describe, expect, it } from 'vitest';
import { isLandFor } from './waterMask.worker';
import { DEFAULT_GENERATION } from '../worldGenerator';

describe('isLandFor (water-mask bake worker)', () => {
  // Seed 12 — matches src/shared/wasted-terrain-golden.json and
  // WorldModel.test.ts's own wasted-island reveal suite. (18, -29) is a
  // wasted-forest hex; (17, -30) is plain open sea bordering wasted land.
  const WASTED_SEED = 12;
  const wastedLand = { q: 18, r: -29 };
  const plainSea = { q: 17, r: -30 };

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

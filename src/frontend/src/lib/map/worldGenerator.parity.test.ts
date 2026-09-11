// Pins the tile the generator builds against the straightforward version it
// replaced.
//
// `generateTile` was rewritten to sample the seven terrains it needs once and
// answer coastal-ness/orientation/variant from those, instead of calling
// `terrainAt`, `isCoastalWater`, `orientationAt` and `variantAt` as four
// independent questions (see its own doc comment for why). Every field it
// produces is mirrored by the backend's `TerrainSampler` or feeds art the
// backend picks alongside it, so "faster" is only acceptable if the answer is
// unchanged down to the last variant index — an off-by-one in the neighbour
// order would rotate coastlines, and a different rounding in the orientation
// sum would desync the client from the server's own terrain.
//
// So the four original functions are kept, exported, as the reference, and
// this requires the rewritten builder to agree with them on every field over a
// patch of world that contains coast, open sea, and island interior, for
// several seeds.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATION,
  generateTile,
  isCoastalWater,
  orientationAt,
  terrainAt,
  variantAt,
  type WorldSeed,
} from './worldGenerator';

const SEEDS = [1, 12345, 20260824, 987654321];

describe('generateTile parity with the per-question implementation', () => {
  for (const seed of SEEDS) {
    const world: WorldSeed = { seed, generation: DEFAULT_GENERATION };

    it(`matches terrain/coastal/orientation/variant for seed ${seed}`, () => {
      let coastalSeen = 0;
      let landSeen = 0;
      let seaSeen = 0;
      for (let q = -45; q <= 45; q++) {
        for (let r = -45; r <= 45; r++) {
          const tile = generateTile(q, r, world);
          expect(tile).toEqual({
            q,
            r,
            terrain: terrainAt(q, r, world),
            isCoastalWater: isCoastalWater(q, r, world),
            orientation: orientationAt(q, r, world),
            variant: variantAt(q, r, world),
          });
          if (tile.isCoastalWater) coastalSeen++;
          else if (tile.terrain === 'sea') seaSeen++;
          else landSeen++;
        }
      }
      // The patch has to actually contain all three kinds, or the parity above
      // is only pinning open water.
      expect(coastalSeen).toBeGreaterThan(50);
      expect(landSeen).toBeGreaterThan(50);
      expect(seaSeen).toBeGreaterThan(50);
    });

    it(`is unaffected by which terrain sampler it is handed, for seed ${seed}`, () => {
      // The cached sampler WorldModel passes must not change the answer.
      const cache = new Map<string, ReturnType<typeof terrainAt>>();
      const cached = (q: number, r: number) => {
        const k = `${q},${r}`;
        let t = cache.get(k);
        if (t === undefined) {
          t = terrainAt(q, r, world);
          cache.set(k, t);
        }
        return t;
      };
      for (let q = -20; q <= 20; q++) {
        for (let r = -20; r <= 20; r++) {
          expect(generateTile(q, r, world, cached)).toEqual(generateTile(q, r, world));
        }
      }
    });
  }
});

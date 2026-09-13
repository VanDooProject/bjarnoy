// The bake worker answers `hasWaterProp` without a `Tile`; this pins that
// answer against the one the renderer's own tiles give.
//
// The prop channel decides where foam and caustics are muted so they do not
// paint over the boat and rock drawn on two of the coastal-water variants. The
// worker cannot read a `Tile` — it has the world seed and a list of hexes that
// carry a building, nothing else — so it re-derives sea/coastal/variant from
// the seed. If that derivation drifts from what `baseTextureFor` actually
// draws, the mute lands on the wrong hexes and the effect it exists to protect
// breaks silently, in a way no rendering test would catch.
//
// So this checks the two predicates agree hex for hex over a patch containing
// open sea, coast and land, for several seeds — and, separately, that a
// building on a prop hex suppresses the prop on both sides.
import { describe, expect, it } from 'vitest';
import { hasWaterProp } from './waterMask';
import { WorldModel } from '../WorldModel';
import { DEFAULT_GENERATION, generateTile, terrainAt } from '../worldGenerator';

const NEIGHBOR_DQ = [1, 1, 0, -1, -1, 0];
const NEIGHBOR_DR = [0, -1, -1, 0, 1, 1];

/** The worker's own predicate, in the shape waterMask.worker.ts implements it. */
function workerHasProp(seed: number, buildingHexes: Set<string>) {
  const world = { seed, generation: DEFAULT_GENERATION };
  const isLand = (q: number, r: number) => terrainAt(q, r, world) !== 'sea';
  const sample = (q: number, r: number) => (isLand(q, r) ? ('grass' as const) : ('sea' as const));
  return (q: number, r: number): boolean => {
    if (isLand(q, r) || buildingHexes.has(`${q},${r}`)) return false;
    for (let i = 0; i < 6; i++) {
      if (!isLand(q + NEIGHBOR_DQ[i], r + NEIGHBOR_DR[i])) continue;
      return hasWaterProp(generateTile(q, r, world, sample));
    }
    return false;
  };
}

describe('the worker prop predicate against the renderer tiles', () => {
  for (const seed of [1, 12345, 20260824]) {
    it(`agrees with hasWaterProp(getTile(...)) for seed ${seed}`, () => {
      const model = new WorldModel(seed);
      const worker = workerHasProp(seed, new Set());
      let props = 0;
      let coastalSea = 0;
      for (let q = -40; q <= 40; q++) {
        for (let r = -40; r <= 40; r++) {
          const tile = model.getTile(q, r);
          const expected = hasWaterProp(tile);
          expect(worker(q, r)).toBe(expected);
          if (expected) props++;
          if (tile.terrain === 'sea' && tile.isCoastalWater) coastalSea++;
        }
      }
      // Pointless if the patch has no prop hexes in it to agree about.
      expect(coastalSea).toBeGreaterThan(50);
      expect(props).toBeGreaterThan(10);
    });
  }

  it('drops the prop where a building stands, on both sides', () => {
    const seed = 12345;
    const model = new WorldModel(seed);
    let target: { q: number; r: number } | null = null;
    for (let q = -40; q <= 40 && !target; q++) {
      for (let r = -40; r <= 40; r++) {
        if (hasWaterProp(model.getTile(q, r))) {
          target = { q, r };
          break;
        }
      }
    }
    expect(target).not.toBeNull();
    const { q, r } = target!;

    // Before: both say yes.
    expect(workerHasProp(seed, new Set())(q, r)).toBe(true);
    expect(hasWaterProp(model.getTile(q, r))).toBe(true);

    // A building on it replaces the coastal art, so there is no prop to protect.
    model.getTile(q, r).buildingType = 'fishinghut' as never;
    expect(hasWaterProp(model.getTile(q, r))).toBe(false);
    expect(workerHasProp(seed, new Set([`${q},${r}`]))(q, r)).toBe(false);
  });
});

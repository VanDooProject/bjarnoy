// Regression coverage for sand deep inside islands: `terrainAt` used to make every hex past
// `beachThreshold` sand, but the domain warp and the coast noise leave interior "saddles"
// where the depth climbs close to 1 without the coast opening there, so beach bands showed
// up a dozen hexes from any sea (seed 20260824 around (-220, -24)). Sand now also needs open
// sea within BEACH_SEA_RADIUS hexes, on green and wasted islands alike. The backend mirror is
// ShoreSandTests (TerrainSampler); parity of the rule itself is covered by the shared
// terrain-checksum and island-shape goldens.
import { describe, expect, it } from 'vitest';
import { hexRing, neighbors, type AxialCoord } from '../hex/coords';
import {
  BEACH_SEA_RADIUS,
  DEFAULT_GENERATION,
  islandDepthAt,
  terrainAt,
  wastedDepthAt,
  wastedTerrainAt,
  type WorldSeed,
} from './worldGenerator';

function* disc(centre: AxialCoord, radius: number): Generator<AxialCoord> {
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      yield { q: centre.q + dq, r: centre.r + dr };
    }
  }
}

function seaWithin(c: AxialCoord, radius: number, isSea: (h: AxialCoord) => boolean): boolean {
  for (let k = 1; k <= radius; k++) for (const h of hexRing(c, k)) if (isSea(h)) return true;
  return false;
}

describe('sand only on the shore', () => {
  const world: WorldSeed = { seed: 20260824, generation: DEFAULT_GENERATION };
  const greenSea = (h: AxialCoord): boolean => islandDepthAt(h.q, h.r, world) === null;

  it('keeps the inland saddle of seed 20260824 off the beach', () => {
    for (const [q, r] of [[-220, -24], [-219, -24], [-219, -23]] as const) {
      // Past the beach threshold, yet no sea for a dozen hexes: land, not sand.
      expect(islandDepthAt(q, r, world)).toBeGreaterThan(DEFAULT_GENERATION.beachThreshold);
      expect(seaWithin({ q, r }, 12, greenSea)).toBe(false);
      expect(terrainAt(q, r, world)).not.toBe('sand');
      expect(terrainAt(q, r, world)).not.toBe('sea');
    }
  });

  it('puts every sand hex of the island within BEACH_SEA_RADIUS of the sea, and keeps the coast a beach', { timeout: 60_000 }, () => {
    let sand = 0;
    let saddles = 0;
    for (const c of disc({ q: -220, r: -24 }, 150)) {
      const depth = islandDepthAt(c.q, c.r, world);
      if (depth === null) continue;
      const terrain = terrainAt(c.q, c.r, world);
      if (terrain === 'sand') {
        sand++;
        expect(seaWithin(c, BEACH_SEA_RADIUS, greenSea), `sand at ${c.q},${c.r}`).toBe(true);
      } else if (depth > DEFAULT_GENERATION.beachThreshold) {
        saddles++;
        expect(seaWithin(c, BEACH_SEA_RADIUS, greenSea), `no sand at ${c.q},${c.r}`).toBe(false);
      }
      // A shoreline hex past the threshold is still sand: the beach stays continuous.
      if (depth > DEFAULT_GENERATION.beachThreshold && neighbors(c).some(greenSea)) expect(terrain).toBe('sand');
    }
    // The old rule made 1449 sand hexes here, 240 of them more than two hexes from the sea.
    expect(sand).toBe(1209);
    expect(saddles).toBe(240);
  });

  it('applies the same rule to wasted islands', { timeout: 60_000 }, () => {
    // Seed 1's wasted island around (260, -1691) has saddles of its own.
    const wasted: WorldSeed = { seed: 1, generation: DEFAULT_GENERATION };
    const wastedSea = (h: AxialCoord): boolean => wastedDepthAt(h.q, h.r, wasted) === null;
    let sand = 0;
    let saddles = 0;
    for (const c of disc({ q: 260, r: -1691 }, 75)) {
      const terrain = wastedTerrainAt(c.q, c.r, wasted);
      if (terrain === 'sea') continue;
      if (terrain === 'sand') {
        sand++;
        expect(seaWithin(c, BEACH_SEA_RADIUS, wastedSea), `sand at ${c.q},${c.r}`).toBe(true);
      } else if (wastedDepthAt(c.q, c.r, wasted)! > DEFAULT_GENERATION.beachThreshold) {
        saddles++;
      }
    }
    expect(sand).toBeGreaterThan(200);
    expect(saddles).toBeGreaterThan(0);
  });
});

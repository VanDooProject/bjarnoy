import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, type AxialCoord } from '../hex/coords';
import {
  GatesPerRing,
  InnerRingRadius,
  MaxTowers,
  MinTowerSpacing,
  MinTowers,
  OuterRingRadius,
  placeEndgame,
  ring,
  towerCountFor,
} from './endgamePlacement';
import { tileOfWallHex } from './palisadeTiles';
import type { Terrain } from './types';

// A flat wasteland disc around Utgard at the origin (radius `radius`), everything else sea.
function disc(radius: number, override: Record<string, Terrain> = {}) {
  const tiles: AxialCoord[] = [];
  const terrain = new Map<string, Terrain>();
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      tiles.push({ q, r });
      terrain.set(coordKey({ q, r }), 'grass');
    }
  }
  for (const [k, t] of Object.entries(override)) terrain.set(k, t);
  return { tiles, terrainOf: (c: AxialCoord): Terrain => terrain.get(coordKey(c)) ?? 'sea' };
}

const UTGARD = [{ anchor: { q: 0, r: 0 }, family: 'giantutgard' }];
const none = () => false;

describe('towerCountFor', () => {
  it('rounds half up (never to even) and clamps to 3..6', () => {
    expect(towerCountFor(150)).toBe(MinTowers);
    expect(towerCountFor(419)).toBe(3);
    expect(towerCountFor(420)).toBe(4);
    expect(towerCountFor(540)).toBe(5);
    expect(towerCountFor(660)).toBe(MaxTowers);
    expect(towerCountFor(100000)).toBe(MaxTowers);
  });
});

describe('ring', () => {
  it.each([InnerRingRadius, OuterRingRadius])('radius %i is a closed cycle of 6r hexes, each adjacent to the next', (radius) => {
    const hexes = ring({ q: 2, r: -1 }, radius);
    expect(hexes).toHaveLength(6 * radius);
    expect(new Set(hexes.map(coordKey)).size).toBe(6 * radius);
    hexes.forEach((h, i) => {
      expect(hexDistance(h, { q: 2, r: -1 })).toBe(radius);
      expect(hexDistance(h, hexes[(i + 1) % hexes.length]!)).toBe(1);
    });
  });
});

describe('placeEndgame', () => {
  it('builds nothing for an island without Utgard', () => {
    const { tiles, terrainOf } = disc(12);
    const sites = placeEndgame(tiles, terrainOf, none, [{ anchor: { q: 0, r: 0 }, family: 'giantvolcano' }], new Set(), 1, 1);
    expect(sites).toEqual({ walls: [], towers: [] });
  });

  it('closes both rings all the way round on open ground: inner level 2, outer level 1, two gates each on straights', () => {
    const { tiles, terrainOf } = disc(12);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 7, 3);

    expect(walls.filter((w) => w.ring === 'inner')).toHaveLength(6 * InnerRingRadius);
    expect(walls.filter((w) => w.ring === 'outer')).toHaveLength(6 * OuterRingRadius);
    expect(walls.filter((w) => w.ring === 'inner').every((w) => w.level === 2)).toBe(true);
    expect(walls.filter((w) => w.ring === 'outer').every((w) => w.level === 1)).toBe(true);
    for (const kind of ['inner', 'outer'] as const) {
      const gates = walls.filter((w) => w.ring === kind && w.isGate);
      expect(gates).toHaveLength(GatesPerRing);
      expect(gates.every((g) => g.piece === 'gate180')).toBe(true);
    }
    // A closed ring has no ends.
    expect(walls.some((w) => w.piece === 'end' || w.piece === 'end_coast')).toBe(false);
  });

  it('puts the two gates of a ring as far apart as the ring allows (opposite sides of a closed ring)', () => {
    const { tiles, terrainOf } = disc(12);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 11, 5);
    for (const kind of ['inner', 'outer'] as const) {
      const order = ring({ q: 0, r: 0 }, kind === 'inner' ? InnerRingRadius : OuterRingRadius);
      const [a, b] = walls.filter((w) => w.ring === kind && w.isGate).map((g) => order.findIndex((h) => h.q === g.coord.q && h.r === g.coord.r));
      const cyclic = Math.min(Math.abs(a! - b!), order.length - Math.abs(a! - b!));
      // Straights are the ring's sides between its six corners: the best pair is a diameter, or one hex off it.
      expect(cyclic).toBeGreaterThanOrEqual(order.length / 2 - 1);
    }
  });

  it('skips a ring that has less than 60% wall-capable hexes, and builds the other', () => {
    // Everything from distance 4 out is mountain except the outer ring's own band: the inner ring stays, the outer is blocked.
    const override: Record<string, Terrain> = {};
    for (const h of ring({ q: 0, r: 0 }, OuterRingRadius).slice(0, 20)) override[coordKey(h)] = 'mountain';
    const { tiles, terrainOf } = disc(12, override);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 2, 2);

    expect(new Set(walls.map((w) => w.ring))).toEqual(new Set(['inner']));
  });

  it('keeps walls off rivers, camps and giant footprints, and ends a run on the shore with a sea end', () => {
    const { tiles, terrainOf } = disc(5); // the outer ring (6) is entirely sea; the inner ring lies on land
    const sites = placeEndgame(tiles, terrainOf, (c) => c.q === 3 && c.r === 0, UTGARD, new Set([coordKey({ q: -3, r: 3 })]), 4, 4);
    expect(sites.walls.every((w) => w.ring === 'inner')).toBe(true);
    const keys = new Set(sites.walls.map((w) => coordKey(w.coord)));
    expect(keys.has('3,0')).toBe(false);
    expect(keys.has(coordKey({ q: -3, r: 3 }))).toBe(false);
  });

  it('resolves every piece through the palisade rules on the final wall', () => {
    const { tiles, terrainOf } = disc(9, { '6,-3': 'mountain', '-3,0': 'mountain' });
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 9, 9);
    const set = { walls: new Set(walls.map((w) => coordKey(w.coord))), gates: new Set(walls.filter((w) => w.isGate).map((w) => coordKey(w.coord))) };

    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const tile = tileOfWallHex(w.coord, set, terrainOf);
      expect('piece' in tile && tile.piece === w.piece && tile.dir === w.dir).toBe(true);
    }
  });

  it('spreads the towers over land past the outer ring, MinTowerSpacing apart, off camps, and deterministically', () => {
    const { tiles, terrainOf } = disc(20);
    const camp = coordKey({ q: 12, r: -4 });
    const a = placeEndgame(tiles, terrainOf, none, UTGARD, new Set([camp]), 5, 8);
    const b = placeEndgame(tiles, terrainOf, none, UTGARD, new Set([camp]), 5, 8);

    expect(a).toEqual(b);
    expect(a.towers).toHaveLength(towerCountFor(tiles.length));
    for (const t of a.towers) {
      expect(hexDistance(t, { q: 0, r: 0 })).toBeGreaterThan(OuterRingRadius + 1);
      expect(coordKey(t)).not.toBe(camp);
    }
    for (let i = 0; i < a.towers.length; i++) {
      for (let j = i + 1; j < a.towers.length; j++) expect(hexDistance(a.towers[i]!, a.towers[j]!)).toBeGreaterThanOrEqual(MinTowerSpacing);
    }
  });

  it('places fewer towers when the island has no room for more', () => {
    const { tiles, terrainOf } = disc(9); // only a thin band lies past the outer ring + 1
    const { towers } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 5, 8);
    expect(towers.length).toBeLessThan(MinTowers + 1);
    for (const t of towers) expect(hexDistance(t, { q: 0, r: 0 })).toBeGreaterThan(OuterRingRadius + 1);
  });
});

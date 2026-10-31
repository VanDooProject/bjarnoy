// The Utgard example follows the endgame map's rules for Utgard's defences: two hex rings round the anchor (radius 3 at wall level 2,
// radius 6 at level 1), built when 60% of their hexes can take a wall, ending in a shore piece where a run reaches the sea; pieces from
// the palisade piece rules; up to two gates per ring on straights, as far apart as the ring allows; clamp(floor(land / 120 + 0.5), 3, 6)
// watchtowers outside the outer ring, at least 5 hexes from each other and from Utgard, never on a giant or wall hex.
import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { giantCoverage } from '../map/giantTiles';
import { findPath, type PathContext } from '../map/hexPath';
import { palisadeRestrictions } from '../map/palisadeMovement';
import {
  RING_MAX_GATES,
  RING_MIN_SHARE,
  TOWER_MIN_SPACING,
  UTGARD_CENTRE,
  UTGARD_RINGS,
  UTGARD_TOWERS,
  buildUtgardExampleTiles,
  hexRing,
  ringBuildableShare,
  ringGates,
  ringPieces,
  ringWallHexes,
  utgardExampleKindOf,
  utgardLandHexes,
  utgardTowerCount,
} from './utgardExample';

const tiles = buildUtgardExampleTiles();
const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
const dist = (c: AxialCoord) => hexDistance(c, UTGARD_CENTRE);

describe('the Utgard example island', () => {
  it('stands Utgard, all seven hexes of it, on the anchor', () => {
    const flower = giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord));
    expect(flower).toHaveLength(7);
    for (const k of flower) expect(byKey.get(k)!.giant).toMatchObject({ family: 'giantutgard', anchor: UTGARD_CENTRE });
    expect(utgardExampleKindOf(byKey.get(coordKey(UTGARD_CENTRE))!)).toBe('utgard');
  });

  it('builds the inner ring at radius 3 as level 2 and the outer one at radius 6 as level 1', () => {
    expect(UTGARD_RINGS.map((r) => [r.radius, r.level])).toEqual([
      [3, 2],
      [6, 1],
    ]);
    for (const ring of UTGARD_RINGS) {
      for (const c of ringWallHexes(ring.id)) {
        expect(dist(c)).toBe(ring.radius);
        expect(byKey.get(coordKey(c))).toMatchObject({ wasted: true, buildingLevel: ring.level });
        expect(['palisade', 'palisadegate']).toContain(byKey.get(coordKey(c))!.buildingType);
      }
      // Nothing else on the map is a wall.
      const walls = tiles.filter((t) => (t.buildingType === 'palisade' || t.buildingType === 'palisadegate') && dist(t) === ring.radius);
      expect(walls).toHaveLength(ringWallHexes(ring.id).length);
    }
    expect(tiles.filter((t) => t.buildingType === 'palisade' || t.buildingType === 'palisadegate')).toHaveLength(
      UTGARD_RINGS.reduce((n, r) => n + ringWallHexes(r.id).length, 0),
    );
  });

  it('builds a ring only when at least 60% of its hexes can take a wall, and lets the outer run reach the coast', () => {
    for (const ring of UTGARD_RINGS) expect(ringBuildableShare(ring.id)).toBeGreaterThanOrEqual(RING_MIN_SHARE);
    expect(ringBuildableShare('inner')).toBe(1);
    expect(ringBuildableShare('outer')).toBeLessThan(1);
    // The inner ring is the full 18 hexes; the outer one is its 36 less the bay's, with a sea end on each side of it.
    expect(ringWallHexes('inner')).toHaveLength(hexRing(3).length);
    const outer = ringPieces('outer');
    const seaEnds = ringWallHexes('outer').filter((c) => byKey.get(coordKey(c))!.terrain === 'sea');
    expect(seaEnds).toHaveLength(2);
    for (const c of seaEnds) {
      expect(outer.get(coordKey(c))).toBe('end_coast');
      expect(byKey.get(coordKey(c))!.isCoastalWater).toBe(true);
    }
  });

  it('closes the inner ring, and gives every wall hex a piece by the palisade piece rules', () => {
    const inner = ringPieces('inner');
    expect(inner.size).toBe(18);
    expect(new Set(inner.values())).toEqual(new Set(['straight180', 'bend120', 'gate180']));
    // The outer ring is an open arc: land ends none, only its two shore ends; the rest are straights, bends and gates.
    const outer = ringPieces('outer');
    expect(outer.size).toBe(ringWallHexes('outer').length);
    expect([...outer.values()].filter((p) => p === 'end' || p === 'end_coast')).toHaveLength(2);
  });

  it('puts two gates in each ring, on straights, as far apart as the ring allows', () => {
    for (const ring of UTGARD_RINGS) {
      const gates = ringGates(ring.id);
      expect(gates.length).toBeLessThanOrEqual(RING_MAX_GATES);
      expect(gates).toHaveLength(2);
      const without = ringPieces(ring.id, []);
      for (const g of gates) {
        expect(without.get(coordKey(g))).toBe('straight180');
        expect(byKey.get(coordKey(g))!.buildingType).toBe('palisadegate');
        expect(ringPieces(ring.id).get(coordKey(g))).toBe('gate180');
      }
      // No other pair of straights is farther apart.
      const straights = ringWallHexes(ring.id).filter((c) => without.get(coordKey(c)) === 'straight180');
      const farthest = Math.max(...straights.flatMap((a) => straights.map((b) => hexDistance(a, b))));
      expect(hexDistance(gates[0]!, gates[1]!)).toBe(farthest);
    }
    expect(tiles.filter((t) => t.buildingType === 'palisadegate')).toHaveLength(4);
    // The inner ring's gates sit opposite each other.
    const [a, b] = ringGates('inner');
    expect(hexDistance(a!, b!)).toBe(6);
  });

  it('stays shut to players: no army walks through a gate, the way the endgame has it', () => {
    const walls = new Map(
      tiles
        .filter((t) => t.buildingType === 'palisade' || t.buildingType === 'palisadegate')
        .map((t) => [coordKey(t), { gate: t.buildingType === 'palisadegate', owner: 'utgard' }]),
    );
    const terrainAt = (c: AxialCoord) => byKey.get(coordKey(c))?.terrain ?? 'sea';
    const ctx: PathContext = {
      terrainAt,
      isRiver: () => false,
      isWideRiver: () => false,
      rules: { land: { grass: 1 }, riverCrossingCost: 8 },
      hexesPerHour: 1,
      restrictions: palisadeRestrictions(walls, terrainAt, () => false, 'a player'),
    };
    expect(findPath(UTGARD_TOWERS[0]!, { q: 0, r: 2 }, ctx)).toBeNull();
  });

  it('has clamp(floor(land / 120 + 0.5), 3, 6) watchtowers, all outside the outer ring, 5 or more apart and from Utgard', () => {
    expect(utgardTowerCount(0)).toBe(3);
    expect(utgardTowerCount(180)).toBe(3);
    expect(utgardTowerCount(420)).toBe(4);
    expect(utgardTowerCount(2000)).toBe(6);
    expect(UTGARD_TOWERS).toHaveLength(utgardTowerCount(utgardLandHexes()));
    const outer = UTGARD_RINGS[1]!.radius;
    const flower = new Set(giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord)));
    for (const t of UTGARD_TOWERS) {
      const tile = byKey.get(coordKey(t))!;
      expect(tile).toMatchObject({ terrain: 'grass', buildingType: 'tower', wasted: true });
      expect(utgardExampleKindOf(tile)).toBe('tower');
      expect(dist(t)).toBeGreaterThan(outer);
      expect(dist(t)).toBeGreaterThanOrEqual(TOWER_MIN_SPACING);
      expect(flower.has(coordKey(t))).toBe(false);
      expect(tile.giant).toBeUndefined();
      expect(neighbors(t).every((n) => byKey.has(coordKey(n)))).toBe(true);
    }
    for (let i = 0; i < UTGARD_TOWERS.length; i++) {
      for (let j = i + 1; j < UTGARD_TOWERS.length; j++) {
        expect(hexDistance(UTGARD_TOWERS[i]!, UTGARD_TOWERS[j]!)).toBeGreaterThanOrEqual(TOWER_MIN_SPACING);
      }
    }
  });
});

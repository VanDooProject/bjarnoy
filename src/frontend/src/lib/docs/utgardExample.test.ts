// The Utgard example is the endgame generator's own output (`placeEndgame`, golden-tested in endgamePlacement.golden.test.ts) tagged on
// a hand-built island the way the world model tags it. These tests check the island shows what the Wasted Lands page says about it:
// two rings round the anchor (radius 3 at wall level 2, radius 6 at level 1), a shore end where a run reaches the sea, up to two gates
// per ring on straights, and clamp(floor(land / 120 + 0.5), 3, 6) watchtowers outside the outer ring, at least 5 hexes from each other
// and from Utgard. The rules themselves are not re-tested here.
import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, type AxialCoord } from '../hex/coords';
import { MinTowerSpacing, towerCountFor } from '../map/endgamePlacement';
import { giantCoverage } from '../map/giantTiles';
import { findPath, type PathContext } from '../map/hexPath';
import { palisadeRestrictions } from '../map/palisadeMovement';
import { UTGARD_CENTRE, UTGARD_RINGS, buildUtgardExampleTiles, utgardExampleKindOf, utgardLandHexes } from './utgardExample';

const tiles = buildUtgardExampleTiles();
const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
const dist = (c: AxialCoord) => hexDistance(c, UTGARD_CENTRE);
const walls = tiles.filter((t) => t.utgardWall);
const towers = tiles.filter((t) => t.jotunTower);

describe('the Utgard example island', () => {
  it('stands Utgard, all seven hexes of it, on the anchor', () => {
    const flower = giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord));
    expect(flower).toHaveLength(7);
    for (const k of flower) expect(byKey.get(k)!.giant).toMatchObject({ family: 'giantutgard', anchor: UTGARD_CENTRE });
    expect(utgardExampleKindOf(byKey.get(coordKey(UTGARD_CENTRE))!)).toBe('utgard');
  });

  it('has the inner ring at radius 3 as level 2 and the outer one at radius 6 as level 1', () => {
    expect(UTGARD_RINGS.map((r) => [r.radius, r.level])).toEqual([
      [3, 2],
      [6, 1],
    ]);
    for (const ring of UTGARD_RINGS) {
      const hexes = walls.filter((t) => t.utgardWall!.ring === ring.id);
      expect(hexes.length).toBeGreaterThan(0);
      for (const t of hexes) {
        expect(dist(t)).toBe(ring.radius);
        expect(t.utgardWall!.level).toBe(ring.level);
      }
    }
    expect(walls.every((t) => t.wasted)).toBe(true);
  });

  it('closes the inner ring and lets the outer one reach the coast with a shore end on each side', () => {
    expect(walls.filter((t) => t.utgardWall!.ring === 'inner')).toHaveLength(18);
    const outer = walls.filter((t) => t.utgardWall!.ring === 'outer');
    expect(outer.length).toBeLessThan(36);
    const ends = outer.filter((t) => t.utgardWall!.piece === 'end_coast');
    expect(ends).toHaveLength(2);
    for (const t of ends) expect(t).toMatchObject({ terrain: 'sea', isCoastalWater: true });
    expect(outer.filter((t) => t.terrain === 'sea')).toHaveLength(2);
  });

  it('has two gates in each ring, on hexes the walls resolve to gate pieces', () => {
    for (const ring of UTGARD_RINGS) {
      const gates = walls.filter((t) => t.utgardWall!.ring === ring.id && t.utgardWall!.isGate);
      expect(gates).toHaveLength(2);
      for (const g of gates) {
        expect(g.utgardWall!.piece).toBe('gate180');
        expect(utgardExampleKindOf(g)).toBe('gate');
      }
    }
    expect(walls.filter((t) => t.utgardWall!.isGate)).toHaveLength(4);
  });

  it('stays shut to players: no army walks through a gate, the way the endgame has it', () => {
    const wallMap = new Map(walls.map((t) => [coordKey(t), { gate: t.utgardWall!.isGate, owner: 'utgard' }]));
    const terrainAt = (c: AxialCoord) => byKey.get(coordKey(c))?.terrain ?? 'sea';
    const ctx: PathContext = {
      terrainAt,
      isRiver: () => false,
      isWideRiver: () => false,
      rules: { land: { grass: 1 }, riverCrossingCost: 8 },
      hexesPerHour: 1,
      restrictions: palisadeRestrictions(wallMap, terrainAt, () => false, 'a player'),
    };
    expect(findPath(towers[0]!, { q: 0, r: 2 }, ctx)).toBeNull();
  });

  it('has clamp(floor(land / 120 + 0.5), 3, 6) watchtowers, all outside the outer ring, 5 or more apart and from Utgard', () => {
    expect(towers.length).toBeGreaterThanOrEqual(3);
    expect(towers).toHaveLength(towerCountFor(utgardLandHexes(tiles)));
    const flower = new Set(giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord)));
    for (const tile of towers) {
      expect(tile).toMatchObject({ terrain: 'grass', wasted: true });
      expect(utgardExampleKindOf(tile)).toBe('tower');
      expect(dist(tile)).toBeGreaterThan(UTGARD_RINGS[1].radius);
      expect(dist(tile)).toBeGreaterThanOrEqual(MinTowerSpacing);
      expect(flower.has(coordKey(tile))).toBe(false);
      expect(tile.utgardWall).toBeUndefined();
    }
    for (let i = 0; i < towers.length; i++) {
      for (let j = i + 1; j < towers.length; j++) expect(hexDistance(towers[i]!, towers[j]!)).toBeGreaterThanOrEqual(MinTowerSpacing);
    }
  });
});

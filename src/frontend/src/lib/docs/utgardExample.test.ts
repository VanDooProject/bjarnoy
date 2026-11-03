// The Utgard example is a real wasted island (the `docs_utgard_example` scenario of the endgame golden fixture) with the endgame
// generator's own output (`placeEndgame`, golden-tested in endgamePlacement.golden.test.ts) tagged on it the way the world model tags
// it. These tests check the copy of the island still equals the fixture and that the map shows what the Wasted Lands page says about it:
// two wall lines round the anchor (wandering in the distance band 3 to 6 at wall level 2, and 7 to 11 at level 1), gates on straights,
// and clamp(floor(land / 120 + 0.5), 3, 6) watchtowers outside the inner band and off the walls, at least 5 hexes from each other and
// from Utgard. The rules themselves are not re-tested here.
import { isWideRiverTile } from '../map/riverGenerator';
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/endgame-placement-golden.json';
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { MinTowerSpacing, towerCountFor } from '../map/endgamePlacement';
import { giantCoverage } from '../map/giantTiles';
import { findPath, type PathContext } from '../map/hexPath';
import { palisadeRestrictions } from '../map/palisadeMovement';
import { wastedVariantAt } from '../map/worldGenerator';
import example from './utgardIslandExample.json';
import { UTGARD_CENTRE, UTGARD_EXAMPLE_WORLD, UTGARD_RINGS, buildUtgardExampleStreams, buildUtgardExampleTiles, utgardExampleKindOf, utgardLandHexes } from './utgardExample';

const golden = (goldenFixtureJson as unknown as { scenarios: { name: string }[] }).scenarios.find((s) => s.name === 'docs_utgard_example');

const tiles = buildUtgardExampleTiles();
const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
const dist = (c: AxialCoord) => hexDistance(c, UTGARD_CENTRE);
const walls = tiles.filter((t) => t.utgardWall);
const towers = tiles.filter((t) => t.jotunTower);

describe('the Utgard example island is a real generated one', () => {
  it('is still the generator-frozen scenario it was copied from', () => {
    expect(golden).toBeDefined();
    const { worldSeed, islandIndex, tiles: t, rivers, giants, camps } = golden as unknown as typeof example;
    expect(example).toEqual({ worldSeed, islandIndex, tiles: t, rivers, giants, camps });
  });

  it('places the same walls and towers as the fixture froze', () => {
    const frozen = golden as unknown as { walls: { q: number; r: number; ring: string; gate: boolean }[]; towers: [number, number][] };
    expect(walls.map((t) => [t.q, t.r, t.utgardWall!.ring, t.utgardWall!.isGate]).sort()).toEqual(
      frozen.walls.map((w) => [w.q, w.r, w.ring, w.gate]).sort(),
    );
    expect(towers.map((t) => coordKey(t)).sort()).toEqual(frozen.towers.map(([q, r]) => coordKey({ q, r })).sort());
  });

  it('traces the same lava streams and camps as the fixture froze, with the game generators', () => {
    const key = ([q, r]: [number, number]) => coordKey({ q, r });
    expect(buildUtgardExampleStreams().map(coordKey).sort()).toEqual(example.rivers.map((r) => key(r as [number, number])).sort());
    expect(tiles.filter((t) => t.camp).map(coordKey).sort()).toEqual(example.camps.map((c) => key(c as [number, number])).sort());
  });

  it('draws every giant of the island, all seven hexes of each', () => {
    expect(example.giants.some((g) => g.family === 'giantutgard')).toBe(true);
    for (const g of example.giants) {
      for (const { coord } of giantCoverage({ q: g.q, r: g.r })) {
        expect(byKey.get(coordKey(coord))!.giant, `(${coord.q},${coord.r})`).toMatchObject({ family: g.family, anchor: { q: g.q, r: g.r } });
      }
    }
  });

  it('has sea round the land, the first ring as coastal water', () => {
    expect(tiles.some((t) => t.terrain === 'sea' && t.isCoastalWater)).toBe(true);
    expect(tiles.some((t) => t.terrain === 'sea' && !t.isCoastalWater)).toBe(true);
  });
});

describe('the Utgard example island', () => {
  it('stands Utgard, all seven hexes of it, on the anchor', () => {
    const flower = giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord));
    expect(flower).toHaveLength(7);
    for (const k of flower) expect(byKey.get(k)!.giant).toMatchObject({ family: 'giantutgard', anchor: UTGARD_CENTRE });
    expect(utgardExampleKindOf(byKey.get(coordKey(UTGARD_CENTRE))!)).toBe('utgard');
  });

  it('keeps the inner wall in its band as level 2 and the outer one in its band as level 1', () => {
    expect(UTGARD_RINGS.map((r) => [...r.band, r.level])).toEqual([
      [3, 6, 2],
      [7, 11, 1],
    ]);
    for (const ring of UTGARD_RINGS) {
      const hexes = walls.filter((t) => t.utgardWall!.ring === ring.id);
      expect(hexes.length).toBeGreaterThan(0);
      for (const t of hexes) {
        // A shore end is a sea hex, the rest stand inside the band.
        expect(dist(t)).toBeGreaterThanOrEqual(ring.band[0]);
        expect(dist(t)).toBeLessThanOrEqual(ring.band[1]);
        expect(t.utgardWall!.level).toBe(ring.level);
      }
    }
    expect(walls.every((t) => t.wasted)).toBe(true);
  });

  it('keeps the two walls apart and ends a run in a shore piece wherever it reaches the sea', () => {
    const inner = walls.filter((t) => t.utgardWall!.ring === 'inner');
    const outer = walls.filter((t) => t.utgardWall!.ring === 'outer');
    for (const o of outer) for (const i of inner) expect(hexDistance(o, i)).toBeGreaterThan(1);
    const ends = walls.filter((t) => t.utgardWall!.piece === 'end_coast');
    expect(ends.length).toBeGreaterThan(0);
    for (const t of ends) expect(t).toMatchObject({ terrain: 'sea', isCoastalWater: true });
    expect(walls.filter((t) => t.terrain === 'sea')).toHaveLength(ends.length);
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
    const streamAt = new Map(buildUtgardExampleStreams().map((t) => [coordKey(t), t]));
    const wallMap = new Map(walls.map((t) => [coordKey(t), { gate: t.utgardWall!.isGate, owner: 'utgard' }]));
    const terrainAt = (c: AxialCoord) => byKey.get(coordKey(c))?.terrain ?? 'sea';
    const ctx: PathContext = {
      terrainAt,
      isRiver: (c) => streamAt.has(coordKey(c)),
      isWideRiver: (c) => {
        const tile = streamAt.get(coordKey(c));
        return tile !== undefined && isWideRiverTile(tile, (n) => streamAt.get(coordKey(n)));
      },
      rules: { land: { grass: 1, forest: 1, sand: 1, mountain: 1 }, riverCrossingCost: 8 },
      hexesPerHour: 1,
      restrictions: palisadeRestrictions(wallMap, terrainAt, () => false, 'a player'),
    };
    // Hexes inside the inner line that a tower's army could reach if the walls were not there; with them, none of those is reachable.
    const open = { ...ctx, restrictions: undefined };
    const inside = tiles.filter((t) => dist(t) >= 2 && dist(t) < UTGARD_RINGS[0].band[0] && t.terrain !== 'sea' && !t.giant && !streamAt.has(coordKey(t)));
    const reachable = inside.filter((t) => findPath(towers[0]!, t, open) !== null);
    expect(reachable.length, 'something inside is reachable without the walls').toBeGreaterThan(0);
    for (const t of reachable) expect(findPath(towers[0]!, t, ctx), `(${t.q},${t.r})`).toBeNull();
  });

  it('has clamp(floor(land / 120 + 0.5), 3, 6) watchtowers outside the inner band, off the walls, 5 or more apart and from Utgard', () => {
    expect(towers.length).toBeGreaterThanOrEqual(3);
    expect(towers).toHaveLength(towerCountFor(utgardLandHexes(tiles)));
    const flower = new Set(giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord)));
    for (const tile of towers) {
      expect(tile).toMatchObject({ wasted: true });
      expect(['grass', 'forest']).toContain(tile.terrain);
      expect(utgardExampleKindOf(tile)).toBe('tower');
      expect(dist(tile)).toBeGreaterThan(UTGARD_RINGS[0].band[1] + 1);
      expect(flower.has(coordKey(tile))).toBe(false);
      expect(tile.utgardWall).toBeUndefined();
      for (const n of neighbors(tile)) expect(byKey.get(coordKey(n))!.utgardWall, `next to a wall (${tile.q},${tile.r})`).toBeUndefined();
    }
    for (let i = 0; i < towers.length; i++) {
      for (let j = i + 1; j < towers.length; j++) expect(hexDistance(towers[i]!, towers[j]!)).toBeGreaterThanOrEqual(MinTowerSpacing);
    }
  });
});

describe('the Utgard example island looks', () => {
  it('draw what the game would roll for the same wasted hex (wastedVariantAt)', () => {
    const land = tiles.filter((t) => t.terrain !== 'sea' && !t.giant);
    expect(land.length).toBeGreaterThan(100);
    for (const t of land) expect(t.variant, `(${t.q},${t.r})`).toBe(wastedVariantAt(t.q, t.r, UTGARD_EXAMPLE_WORLD, t.terrain));
  });
});

describe('the Utgard example lava streams', () => {
  const streams = buildUtgardExampleStreams();
  const streamKeys = new Set(streams.map(coordKey));
  const giantKeys = new Set(giantCoverage(UTGARD_CENTRE).map((g) => coordKey(g.coord)));

  it('come from the game generator: wasted, and at least one runs from a mountain to the sea', () => {
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.every((s) => s.wasted)).toBe(true);
    const springs = streams.filter((s) => s.shape === 'spring');
    expect(springs.length).toBeGreaterThanOrEqual(1);
    for (const s of springs) expect(byKey.get(coordKey(s))!.terrain).toBe('mountain');
    const mouths = streams.filter((s) => s.shape === 'mouth');
    expect(mouths.length).toBeGreaterThanOrEqual(1);
    for (const m of mouths) expect(neighbors(m).some((n) => byKey.get(coordKey(n))?.terrain === 'sea')).toBe(true);
  });

  it('never run through Utgard, and no mountain stands on it', () => {
    for (const k of giantKeys) {
      expect(streamKeys.has(k)).toBe(false);
      expect(byKey.get(k)!.terrain).not.toBe('mountain');
    }
  });

  it('leave no wall or tower on a stream hex', () => {
    for (const t of [...walls, ...towers]) expect(streamKeys.has(coordKey(t)), `(${t.q},${t.r})`).toBe(false);
  });

  it('name a hovered stream hex and mountain hex', () => {
    const stream = streams[0]!;
    expect(utgardExampleKindOf(byKey.get(coordKey(stream))!, stream)).toBe('lava');
    const mountain = tiles.find((t) => t.terrain === 'mountain')!;
    expect(utgardExampleKindOf(mountain)).toBe('mountain');
  });
});

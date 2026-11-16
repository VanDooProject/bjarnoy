import { describe, expect, it } from 'vitest';
import campGoldenJson from '../../../../shared/camp-placement-golden.json';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import example from './riverIslandExample.json';
import {
  RIVER_ISLAND_BUILDINGS,
  RIVER_ISLAND_LONGHOUSE,
  RIVER_ISLAND_RIVERS,
  RIVER_ISLAND_SETTLEMENT,
  RIVER_ISLAND_WORLD,
  buildRiverIslandGround,
  riverIslandTileName,
  riverIslandWorld,
} from './riverIsland';
import { coordKey, hexDistance } from '../hex/coords';
import { StartPositionMargin } from '../map/campPlacement';
import { radiusBoostRange, maxLevelFor } from '../map/buildingEconomy';
import { buildingAllowedOnHex, riverBuildingAllowedHere } from '../map/ringCatalogue';
import { generateRiversWithBogs, isWideRiverTile } from '../map/riverGenerator';
import { StartPositionExclusionRadius } from '../map/giantPlacement';
import { islandDepthAt, terrainAt } from '../map/worldGenerator';
import type { BogTile, Terrain, Tile } from '../map/types';

const golden = (campGoldenJson as unknown as { scenarios: { name: string }[] }).scenarios.find(
  (s) => s.name === 'green_island_mixed_with_bearrapids',
);
const ex = example as unknown as {
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  bogs: BogTile[];
  rivers: unknown;
  giants: [number, number][];
  camps: { q: number; r: number; family: string; level: number }[];
};
const DEFINITIONS = catalogue.data as unknown as BuildingDefinitionResponse[];

describe('rivers example island', () => {
  it('is still the generator-frozen scenario it was copied from', () => {
    expect(golden).toBeDefined();
    const { worldSeed, islandIndex, tiles, plainBog, rivers, giants, camps } = golden as unknown as typeof example & { plainBog: [number, number][] };
    expect({ ...example, bogs: undefined }).toEqual({ worldSeed, islandIndex, tiles, rivers, giants, camps, bogs: undefined });
    // The fixture only knows the plain moss; the rest of the bogland is what the game's own bog generator makes over the island.
    expect(example.bogs.filter((b) => b.kind === 'bog').map((b) => [b.q, b.r])).toEqual(plainBog);
  });

  it('has the bogland the game generates over the same island', () => {
    const tiles = ex.tiles.map(([q, r]) => ({ q, r }));
    const seedTerrain = new Map(ex.tiles.map(([q, r]) => [coordKey({ q, r }), terrainAt(q, r, RIVER_ISLAND_WORLD)]));
    const out = generateRiversWithBogs(
      tiles,
      (c) => seedTerrain.get(coordKey(c)) ?? 'sea',
      (c) => islandDepthAt(c.q, c.r, RIVER_ISLAND_WORLD),
      (c) => terrainAt(c.q, c.r, RIVER_ISLAND_WORLD) !== 'sea',
      ex.worldSeed,
      ex.islandIndex,
    );
    expect(out.bogs).toEqual(ex.bogs);
    expect(out.rivers.map(({ wasted: _wasted, ...tile }) => tile)).toEqual(ex.rivers);
  });

  it('draws the island as the world does: bog and lake, every river on land, camps, giants, a ring of coastal water and of sea', () => {
    const tiles = buildRiverIslandGround();
    const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
    expect(byKey.size).toBe(tiles.length);
    for (const bog of ex.bogs) {
      const tile = byKey.get(coordKey(bog))!;
      expect(tile.terrain).toBe(bog.kind === 'lake' ? 'lake' : 'bog');
      expect(tile.bog).toEqual(bog);
    }
    for (const river of RIVER_ISLAND_RIVERS) expect(byKey.get(coordKey(river))?.terrain).not.toBe('sea');
    expect(tiles.some((t) => t.terrain === 'sea' && t.isCoastalWater)).toBe(true);
    expect(tiles.some((t) => t.terrain === 'sea' && !t.isCoastalWater)).toBe(true);
    for (const camp of ex.camps) expect(byKey.get(coordKey(camp))?.camp).toMatchObject({ family: camp.family, level: camp.level });
    const bear = tiles.find((t) => t.camp?.family === 'bearrapids')!;
    expect(bear.camp).toMatchObject({ orientation: 'W', strong: true });
    // Both fixture giants stand with all seven hexes tagged (a forest hex under one is flattened to grass).
    for (const [q, r] of ex.giants) {
      const anchor = byKey.get(coordKey({ q, r }))!;
      expect(anchor.giant).toMatchObject({ part: 'C', anchor: { q, r } });
      expect(tiles.filter((t) => t.giant?.anchor.q === q && t.giant.anchor.r === r)).toHaveLength(7);
    }
    expect(tiles.filter((t) => t.giant && t.terrain === 'forest')).toEqual([]);
  });

  it('has every kind of river piece the page names', () => {
    const kinds = new Set(RIVER_ISLAND_RIVERS.map((r) => `${r.shape}:${r.width}`));
    for (const kind of ['spring:stream', 'straight:stream', 'straight:widen', 'straight:river', 'bend:river', 'confluence:riverstream', 'confluence:river', 'mouth:river'])
      expect(kinds).toContain(kind);
  });
});

describe('rivers example island realm', () => {
  const world = riverIslandWorld();

  it('holds every building inside the claim, on the hex the snapshot says', () => {
    for (const b of RIVER_ISLAND_BUILDINGS) {
      const tile = world.getTile(b.q, b.r);
      expect(tile.buildingType, `${b.type} at ${b.q},${b.r}`).toBe(b.type);
      expect(tile.ownerId, `${b.type} at ${b.q},${b.r}`).toBe(RIVER_ISLAND_SETTLEMENT);
    }
  });

  it('places every building by the game rules: the same checks placeBuilding makes, building by building', () => {
    // A fresh realm of just the Longhouse; the rest is placed through `placeBuilding`, which refuses a hex the rules refuse (a camp or
    // giant on it, the wrong ground, a river shape the building has no art for or a stream, a bridge over a stream, a hex outside the claim).
    const fresh = riverIslandWorld(RIVER_ISLAND_BUILDINGS.filter((b) => b.type === 'longhouse'));
    for (const b of RIVER_ISLAND_BUILDINGS.filter((x) => x.type !== 'longhouse')) {
      expect(fresh.placeBuilding(RIVER_ISLAND_SETTLEMENT, b, b.type as Tile['buildingType']), `${b.type} at ${b.q},${b.r}`).toBe(true);
    }
  });

  it('checks the river buildings by the placement functions themselves', () => {
    for (const b of RIVER_ISLAND_BUILDINGS) {
      const river = world.getRiverTile(b.q, b.r);
      const base = buildRiverIslandGround().find((t) => t.q === b.q && t.r === b.r)!;
      expect(buildingAllowedOnHex(b.type, base), `${b.type} ground`).toBe(true);
      if (b.type === 'sawmill' || b.type === 'cropmill' || b.type === 'bridge') {
        expect(river, `${b.type} stands on a river hex`).toBeDefined();
        expect(isWideRiverTile(river!, (c) => world.getRiverTile(c.q, c.r)), `${b.type} on a wide river`).toBe(true);
        expect(riverBuildingAllowedHere(b.type, river!.shape, world.riverVariantAt(b, river!.shape), river!.width), `${b.type} shape`).toBe(true);
      } else {
        expect(river, `${b.type} is not on a river`).toBeUndefined();
      }
    }
    const crop = RIVER_ISLAND_BUILDINGS.find((b) => b.type === 'cropmill')!;
    expect(world.getRiverTile(crop.q, crop.r)?.shape).toBe('straight');
    const bridge = RIVER_ISLAND_BUILDINGS.find((b) => b.type === 'bridge')!;
    expect(world.bridgePlacement(bridge)).toEqual({ ok: true });
    expect(world.getRiverTile(bridge.q, bridge.r)?.shape).toBe('straight');
  });

  it('keeps clear of every camp and giant, and the bear rapids stay on the map', () => {
    const camps = buildRiverIslandGround().filter((t) => t.camp);
    for (const b of RIVER_ISLAND_BUILDINGS) {
      const tile = world.getTile(b.q, b.r);
      expect(tile.camp, `${b.type} on a camp`).toBeUndefined();
      expect(tile.giant, `${b.type} on a giant`).toBeUndefined();
    }
    const bear = world.getTile(camps.find((c) => c.camp?.family === 'bearrapids')!.q, camps.find((c) => c.camp?.family === 'bearrapids')!.r);
    expect(bear.camp?.removed).toBeFalsy();
    expect(bear.buildingType).toBeUndefined();
    // The Longhouse is a place a real start could be: out of every strong camp's guard range plus the margin, and clear of the giants.
    for (const c of camps) if (c.camp!.strong) expect(hexDistance(RIVER_ISLAND_LONGHOUSE, c)).toBeGreaterThan(c.camp!.guardRange + StartPositionMargin);
    for (const [q, r] of ex.giants) expect(hexDistance(RIVER_ISLAND_LONGHOUSE, { q, r })).toBeGreaterThan(StartPositionExclusionRadius);
  });

  it('stands at levels the catalogue allows, with what each building needs standing beside it', () => {
    const standing = (type: string) => Math.max(0, ...RIVER_ISLAND_BUILDINGS.filter((b) => b.type === type).map((b) => b.level));
    const longhouse = standing('longhouse');
    for (const b of RIVER_ISLAND_BUILDINGS) {
      expect(b.level, `${b.type} level`).toBeLessThanOrEqual(maxLevelFor(b.type as Parameters<typeof maxLevelFor>[0]));
      const def = DEFINITIONS.find((d) => d.type === b.type && d.level === b.level)!;
      expect(def, `${b.type} ${b.level}`).toBeDefined();
      expect(def.requiredLonghouseLevel, `${b.type} Longhouse level`).toBeLessThanOrEqual(longhouse);
      const level1 = DEFINITIONS.find((d) => d.type === b.type && d.level === 1)!;
      for (const need of level1.prerequisites) expect(standing(need.type), `${b.type} needs ${need.type}`).toBeGreaterThanOrEqual(need.level);
    }
  });

  it('puts the Lumberjacks within the Sawmill\'s range and the Farms within the Crop Mill\'s', () => {
    const of = (type: string) => RIVER_ISLAND_BUILDINGS.filter((b) => b.type === type);
    const [saw] = of('sawmill');
    const [crop] = of('cropmill');
    expect(of('lumberjack')).toHaveLength(2);
    expect(of('farm')).toHaveLength(2);
    for (const l of of('lumberjack')) expect(hexDistance(l, saw)).toBeLessThanOrEqual(radiusBoostRange(saw.level));
    for (const f of of('farm')) expect(hexDistance(f, crop)).toBeLessThanOrEqual(radiusBoostRange(crop.level));
  });

  it('is claimed by the model: every building hex is the viewer\'s', () => {
    const owned = buildRiverIslandGround().filter((t) => world.getTile(t.q, t.r).ownerId === RIVER_ISLAND_SETTLEMENT);
    expect(owned.length).toBeGreaterThanOrEqual(RIVER_ISLAND_BUILDINGS.length);
    expect(owned.some((t) => t.camp)).toBe(false);
    expect(owned.some((t) => t.giant)).toBe(false);
  });
});

describe('rivers example island hover names', () => {
  const world = riverIslandWorld();
  const nameAt = (q: number, r: number) => riverIslandTileName(world.getTile(q, r), world.getRiverTile(q, r));
  const first = (pred: (r: (typeof RIVER_ISLAND_RIVERS)[number]) => boolean) => RIVER_ISLAND_RIVERS.find(pred)!;

  it('names a building first, then a camp, then the river piece', () => {
    expect(nameAt(-33, 250)).toEqual({ text: 'Sawmill' });
    expect(nameAt(-35, 250)).toEqual({ text: 'Bridge' });
    expect(nameAt(-29, 254)).toEqual({ key: 'docs.wildlifeCamps.list.bearrapids.name' });
    const spring = first((r) => r.shape === 'spring');
    expect(nameAt(spring.q, spring.r)).toEqual({ key: 'docs.rivers.example.pieces.spring' });
    const stream = first((r) => r.shape === 'straight' && r.width === 'stream');
    expect(nameAt(stream.q, stream.r)).toEqual({ key: 'docs.rivers.example.pieces.stream' });
    const widen = first((r) => r.width === 'widen');
    expect(nameAt(widen.q, widen.r)).toEqual({ key: 'docs.rivers.example.pieces.widening' });
    const river = first((r) => r.shape === 'straight' && r.width === 'river' && !world.getTile(r.q, r.r).buildingType && !world.getTile(r.q, r.r).camp);
    expect(nameAt(river.q, river.r)).toEqual({ key: 'docs.rivers.example.pieces.river' });
    for (const shape of ['confluence', 'mouth'] as const) {
      const piece = first((r) => r.shape === shape);
      expect(nameAt(piece.q, piece.r)).toEqual({ key: `docs.rivers.example.pieces.${shape}` });
    }
  });

  it('names every other hex: bog, giant, sea and ground', () => {
    const terrains = new Set<Terrain>();
    for (const tile of buildRiverIslandGround()) {
      const name = riverIslandTileName(world.getTile(tile.q, tile.r), world.getRiverTile(tile.q, tile.r));
      expect(name).not.toBeNull();
      terrains.add(tile.terrain);
    }
    expect(terrains.size).toBeGreaterThan(4);
    const giant = ex.giants[0]!;
    expect(nameAt(giant[0], giant[1])).toEqual({ text: expect.any(String) });
  });
});

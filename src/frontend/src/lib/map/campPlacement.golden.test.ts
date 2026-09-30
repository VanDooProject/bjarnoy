// Wildlife camp placement's cross-language anti-drift guard (frontend half) —
// `src/shared/camp-placement-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.CampPlacementGoldenTests` (backend): each side computes
// against the same real island (tiles/terrain, river tiles, giant anchors, world
// seed, island index, wasted flag) with its OWN production implementation
// (`placeCamps` here, `CampGenerator.PlaceCore` there), then asserts the
// fixture's frozen, ORDER-SENSITIVE camp list.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/camp-placement-golden.json';
import { coordKey, type AxialCoord } from '../hex/coords';
import { placeCamps } from './campPlacement';
import type { RiverTile, RiverTileShape, Terrain, TileOrientation } from './types';

interface Scenario {
  name: string;
  worldSeed: number;
  islandIndex: number;
  wasted: boolean;
  tiles: [number, number, Terrain][];
  rivers: { q: number; r: number; shape: RiverTileShape; inDirections: TileOrientation[]; outDirection: TileOrientation | null }[];
  giants: [number, number][];
  camps: { q: number; r: number; family: string; level: number; orientation: TileOrientation | null }[];
}

const fixture = goldenFixtureJson as unknown as { scenarios: Scenario[] };

describe('camp-placement golden fixture (wildlife camp parity)', () => {
  it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario: Scenario) => {
    const tiles: AxialCoord[] = scenario.tiles.map(([q, r]) => ({ q, r }));
    const terrainByHex = new Map<string, Terrain>(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
    const terrainOf = (c: AxialCoord): Terrain => terrainByHex.get(coordKey(c)) ?? 'sea';
    const rivers: RiverTile[] = scenario.rivers.map((r) => ({ ...r }));
    const giants: AxialCoord[] = scenario.giants.map(([q, r]) => ({ q, r }));

    const actual = placeCamps(tiles, terrainOf, rivers, giants, scenario.worldSeed, scenario.islandIndex, scenario.wasted);

    expect(actual.map((p) => ({ q: p.coord.q, r: p.coord.r, family: p.family, level: p.level, orientation: p.orientation }))).toEqual(
      scenario.camps,
    );
  });

  it('covers the shapes the rules care about', () => {
    const families = new Set(fixture.scenarios.flatMap((s) => s.camps.map((c) => c.family)));
    expect(families).toContain('bearrapids');
    expect(families).toContain('fenrirbrood');
    const wasted = fixture.scenarios.filter((s) => s.wasted);
    expect(wasted.length).toBeGreaterThan(0);
    for (const s of wasted) expect(s.camps.every((c) => c.family === 'fenrirbrood')).toBe(true);
  });
});

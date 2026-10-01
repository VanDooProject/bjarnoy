// Issue #159 part B's anti-drift guard (now also the movement rules: wide rivers and mountains impassable,
// streams a flat 9). src/shared/river-pathing-golden.json
// is read by this suite and by HexPathfinderGoldenTests.cs on the backend —
// each side computes against the same terrain patch and cases using its OWN
// production cost tables/river rule, then asserts the fixture's frozen
// numbers. Either side's cost model drifting from the other turns its own
// suite red instead of the client's range tint quietly disagreeing with what
// the server actually paths over.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/river-pathing-golden.json';
import { coordKey } from '../hex/coords';
import { findPath, hoursFrom, pathCost, reachableRange, type PathContext } from './hexPath';
import { palisadeRestrictions } from './palisadeMovement';
import { isWideRiverTile } from './riverGenerator';
import type { RiverTile, Terrain } from './types';

interface HexCoordDto {
  q: number;
  r: number;
}

interface FindPathCase {
  name: string;
  from: HexCoordDto;
  to: HexCoordDto;
  isLandUnit: boolean;
  /** Whose army walks: the wall owner's or an enemy's. */
  army: 'friendly' | 'enemy';
  /** `null`: no land route exists. */
  expectedPath: HexCoordDto[] | null;
  expectedCumulativeHours: number[] | null;
}

interface ReachableRangeCase {
  name: string;
  origin: HexCoordDto;
  home: HexCoordDto;
  hoursOfFood: number;
  expectedReachable: (HexCoordDto & { hours: number })[];
}

interface GoldenFixture {
  terrain: Record<string, Terrain>;
  riverTiles: RiverTile[];
  walls: { q: number; r: number; gate: boolean; owner: string }[];
  findPathCases: FindPathCase[];
  reachableRangeCases: ReachableRangeCase[];
}

const fixture = goldenFixtureJson as unknown as GoldenFixture;

// The same cost table HexPathfinder.cs's LandTerrainCost/RiverCrossingCost
// hardcode — see hexPath.ts's own remarks on why this is a deliberate
// duplicate rather than an import from stores/world.ts (a live world's
// numbers, not this fixture's fixed production reference).
const RULES = {
  land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0 },
  riverCrossingCost: 8.0,
};

function contextFor(fixture: GoldenFixture, army: 'friendly' | 'enemy' = 'friendly'): PathContext {
  const riverByKey = new Map(fixture.riverTiles.map((t) => [coordKey(t), t]));
  const riverAt = (c: HexCoordDto) => riverByKey.get(coordKey(c));
  const terrainAt = (c: HexCoordDto): Terrain => fixture.terrain[coordKey(c)] ?? 'sea';
  const isWideRiver = (c: HexCoordDto) => {
    const tile = riverAt(c);
    return tile !== undefined && isWideRiverTile(tile, riverAt);
  };
  const walls = new Map(fixture.walls.map((w) => [coordKey(w), { gate: w.gate, owner: w.owner }]));
  const owner = fixture.walls[0]?.owner ?? '';
  return {
    terrainAt,
    isRiver: (c) => riverByKey.has(coordKey(c)),
    isWideRiver,
    rules: RULES,
    hexesPerHour: 1,
    restrictions: palisadeRestrictions(walls, terrainAt, isWideRiver, army === 'friendly' ? owner : 'someone-else'),
  };
}

describe('hexPath golden fixture (issue #159 part B parity)', () => {
  it.each(fixture.findPathCases)('$name: matches the shared golden fixture', (testCase: FindPathCase) => {
    const ctx = contextFor(fixture, testCase.army);
    const hours = hoursFrom(testCase.from, ctx, Number.POSITIVE_INFINITY);

    const destinationKey = coordKey(testCase.to);
    if (testCase.expectedPath === null || testCase.expectedCumulativeHours === null) {
      expect(hours.has(destinationKey)).toBe(false);
      return;
    }
    const expectedTotal = testCase.expectedCumulativeHours.at(-1)!;
    expect(hours.get(destinationKey)).toBeCloseTo(expectedTotal, 9);

    // hexPath.ts reports only the cheapest hour figure per hex, not the path
    // itself (unlike HexPathfinder.FindPath) — cross-check every hex the
    // fixture's expected path visits lands on the exact cumulative hour the
    // backend recorded for it, which is the real parity claim: both sides
    // agree on the cost of the same route, hex for hex.
    testCase.expectedPath.forEach((coord: HexCoordDto, i: number) => {
      expect(hours.get(coordKey(coord))).toBeCloseTo(testCase.expectedCumulativeHours![i], 9);
    });
  });

  it.each(fixture.findPathCases.filter((c) => c.isLandUnit))('$name: findPath returns the fixture path and cost', (testCase: FindPathCase) => {
    const ctx = contextFor(fixture, testCase.army);
    const path = findPath(testCase.from, testCase.to, ctx);
    if (testCase.expectedPath === null) {
      expect(path).toBeNull();
      return;
    }
    expect(path?.map(coordKey)).toEqual(testCase.expectedPath.map(coordKey));
    expect(pathCost(path!, ctx)).toBeCloseTo(testCase.expectedCumulativeHours!.at(-1)!, 9);
  });

  it('covers a wide river and a mountain that stop a land army, and a stream on a mountain at a flat 9', () => {
    const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
    expect(byName.get('wide_river_is_impassable')?.expectedPath).toBeNull();
    expect(byName.get('mountain_with_no_way_round_has_no_route')?.expectedPath).toBeNull();
    expect(byName.get('stream_on_a_mountain_costs_a_flat_9')?.expectedCumulativeHours).toEqual([0, 9, 10]);
  });

  it('covers a gate for the owner and not for an enemy, a half-open end at a flat 3 and a sealed end', () => {
    const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
    expect(byName.get('wall_with_a_gate_stops_an_enemy')?.expectedPath).toBeNull();
    expect(byName.get('wall_with_a_gate_lets_the_owner_through')?.expectedCumulativeHours?.at(-1)).toBe(4);
    expect(byName.get('wall_without_a_gate_stops_the_owner_too')?.expectedPath).toBeNull();
    expect(byName.get('half_open_end_is_crossed_by_an_enemy_at_3')?.expectedCumulativeHours?.slice(3, 5)).toEqual([3, 6]);
    expect(byName.get('sealed_end_beside_a_mountain_blocks')?.expectedPath).toBeNull();
  });

  it.each(fixture.reachableRangeCases)('$name: matches the shared golden fixture', (testCase: ReachableRangeCase) => {
    const ctx = contextFor(fixture);
    const range = reachableRange(testCase.origin, testCase.home, testCase.hoursOfFood, ctx);

    const expectedKeys = new Set(testCase.expectedReachable.map((h) => coordKey(h)));
    expect(new Set(range.keys())).toEqual(expectedKeys);

    for (const expected of testCase.expectedReachable) {
      expect(range.get(coordKey(expected))).toBeCloseTo(expected.hours, 9);
    }
  });
});


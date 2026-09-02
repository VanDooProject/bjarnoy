// Issue #159 part B's anti-drift guard. src/shared/river-pathing-golden.json
// is read by this suite and by HexPathfinderGoldenTests.cs on the backend —
// each side computes against the same terrain patch and cases using its OWN
// production cost tables/river rule, then asserts the fixture's frozen
// numbers. Either side's cost model drifting from the other turns its own
// suite red instead of the client's range tint quietly disagreeing with what
// the server actually paths over.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/river-pathing-golden.json';
import { coordKey } from '../hex/coords';
import { hoursFrom, reachableRange, type PathContext } from './hexPath';
import type { Terrain } from './types';

interface HexCoordDto {
  q: number;
  r: number;
}

interface FindPathCase {
  name: string;
  from: HexCoordDto;
  to: HexCoordDto;
  isLandUnit: boolean;
  expectedPath: HexCoordDto[];
  expectedCumulativeHours: number[];
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
  riverTiles: string[];
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

function contextFor(fixture: GoldenFixture): PathContext {
  const riverSet = new Set(fixture.riverTiles);
  return {
    terrainAt: (c) => fixture.terrain[coordKey(c)] ?? 'sea',
    isRiver: (c) => riverSet.has(coordKey(c)),
    rules: RULES,
    hexesPerHour: 1,
  };
}

describe('hexPath golden fixture (issue #159 part B parity)', () => {
  it.each(fixture.findPathCases)('$name: matches the shared golden fixture', (testCase: FindPathCase) => {
    const ctx = contextFor(fixture);
    const hours = hoursFrom(testCase.from, ctx, Number.POSITIVE_INFINITY);

    const destinationKey = coordKey(testCase.to);
    const expectedTotal = testCase.expectedCumulativeHours.at(-1)!;
    expect(hours.get(destinationKey)).toBeCloseTo(expectedTotal, 9);

    // hexPath.ts reports only the cheapest hour figure per hex, not the path
    // itself (unlike HexPathfinder.FindPath) — cross-check every hex the
    // fixture's expected path visits lands on the exact cumulative hour the
    // backend recorded for it, which is the real parity claim: both sides
    // agree on the cost of the same route, hex for hex.
    testCase.expectedPath.forEach((coord: HexCoordDto, i: number) => {
      expect(hours.get(coordKey(coord))).toBeCloseTo(testCase.expectedCumulativeHours[i], 9);
    });
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


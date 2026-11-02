// The island shape's cross-language anti-drift guard (frontend half) —
// `src/shared/island-shape-golden.json` is generated from this module's generator by
// `scripts/regen-goldens/island-shape-golden.ts` and asserted here (so an edit to
// `worldGenerator.ts` that changes any shape fails until the fixture is regenerated) and
// by `Bjarnoy.Domain.Tests.IslandShapeGoldenTests` (backend), which recomputes every
// island cell and sample with `TerrainSampler` and compares doubles bit for bit.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/island-shape-golden.json';
import {
  enumerateIslandShapes,
  islandDepthAt,
  terrainAt,
  wastedDepthAt,
  wastedTerrainAt,
  type WorldGenerationConstants,
  type WorldSeed,
} from './worldGenerator';

interface Scenario {
  name: string;
  seed: number;
  generation: WorldGenerationConstants;
  shapes: {
    cellCol: number;
    cellRow: number;
    cx: number;
    cy: number;
    reach: number;
    sizeClass: string;
    clamp: number;
    spineX: number[];
    spineY: number[];
    width: number[];
    isletX: number[];
    isletY: number[];
    isletRadius: number[];
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  }[];
  wastedShapes: { cellCol: number; cellRow: number; cx: number; cy: number; reach: number }[];
  samples: [number, number, number | null, number | null, string, string][];
}

const scenarios = (goldenFixtureJson as unknown as { scenarios: Scenario[] }).scenarios;

describe('island-shape golden fixture (island shape parity)', () => {
  it.each(scenarios)('$name: island cell shapes match', (scenario) => {
    const world: WorldSeed = { seed: scenario.seed, generation: scenario.generation };
    const actual = enumerateIslandShapes(world).map((s) => ({
      cellCol: s.cellCol,
      cellRow: s.cellRow,
      cx: s.cx,
      cy: s.cy,
      reach: s.reach,
      sizeClass: s.sizeClass,
      clamp: s.clamp,
      spineX: s.sx,
      spineY: s.sy,
      width: s.w,
      isletX: s.ix,
      isletY: s.iy,
      isletRadius: s.ir,
      minCol: s.minCol,
      maxCol: s.maxCol,
      minRow: s.minRow,
      maxRow: s.maxRow,
    }));
    expect(actual).toEqual(scenario.shapes);
  });

  it.each(scenarios)('$name: wasted island cells match', (scenario) => {
    const world: WorldSeed = { seed: scenario.seed, generation: scenario.generation };
    const actual = enumerateIslandShapes(world, true).map((s) => ({
      cellCol: s.cellCol,
      cellRow: s.cellRow,
      cx: s.cx,
      cy: s.cy,
      reach: s.reach,
    }));
    expect(actual).toEqual(scenario.wastedShapes);
  });

  it.each(scenarios)('$name: depth and terrain match at every sampled hex', (scenario) => {
    const world: WorldSeed = { seed: scenario.seed, generation: scenario.generation };
    const actual = scenario.samples.map(([q, r]) => [
      q,
      r,
      islandDepthAt(q, r, world),
      wastedDepthAt(q, r, world),
      terrainAt(q, r, world),
      wastedTerrainAt(q, r, world),
    ]);
    expect(actual).toEqual(scenario.samples);
    // The fixture must exercise islands, not just sea.
    expect(scenario.samples.filter((s) => s[2] !== null).length).toBeGreaterThan(20);
  });

  it('a cached shape does not go stale when a generation object is edited in place', () => {
    const generation = { ...scenarios[0].generation };
    const world: WorldSeed = { seed: 11, generation };
    const before = enumerateIslandShapes(world).map((s) => s.cx);
    generation.islandCellSize = 300;
    const after = enumerateIslandShapes(world).map((s) => s.cx);
    expect(after).not.toEqual(before);
    generation.islandCellSize = scenarios[0].generation.islandCellSize;
    expect(enumerateIslandShapes(world).map((s) => s.cx)).toEqual(before);
  });
});

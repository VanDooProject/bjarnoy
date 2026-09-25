// Wasted-island terrain's cross-language anti-drift guard (frontend half) —
// `src/shared/wasted-terrain-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.WastedTerrainGoldenTests` (backend) — each side
// samples the same seeds/radius using its OWN production implementation
// (`wastedTerrainAt` here, `TerrainSampler.WastedTerrainAt` there), then
// asserts the fixture's frozen, sorted list of wasted-land hexes. Mirrors
// `giantPlacement.golden.test.ts`'s own pattern for loading a
// `src/shared/*.json` fixture.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/wasted-terrain-golden.json';
import { DEFAULT_GENERATION, wastedTerrainAt } from './worldGenerator';
import type { Terrain } from './types';

interface Scenario {
  seed: number;
  radius: number;
  hexes: [number, number, Terrain][];
}

interface GoldenFixture {
  scenarios: Scenario[];
}

const fixture = goldenFixtureJson as unknown as GoldenFixture;

describe('wasted-terrain golden fixture (wasted islands parity)', () => {
  it.each(fixture.scenarios)('seed=$seed: matches the shared golden fixture', (scenario: Scenario) => {
    const world = { seed: scenario.seed, generation: DEFAULT_GENERATION };
    const actual: [number, number, Terrain][] = [];

    for (let q = -scenario.radius; q <= scenario.radius; q++) {
      const rMin = Math.max(-scenario.radius, -q - scenario.radius);
      const rMax = Math.min(scenario.radius, -q + scenario.radius);
      for (let r = rMin; r <= rMax; r++) {
        const terrain = wastedTerrainAt(q, r, world);
        if (terrain !== 'sea') actual.push([q, r, terrain]);
      }
    }

    actual.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));

    expect(actual).toEqual(scenario.hexes);
  });
});

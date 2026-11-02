// Terrain/orientation/variant parity over the whole default world (frontend half) —
// `src/shared/terrain-checksum-golden.json` is generated from this module's generator by
// `scripts/regen-goldens/terrain-checksum-golden.ts`, and asserted here (so an edit to
// worldGenerator.ts that moves any hex fails until the fixture is regenerated) and by
// the backend's TerrainSamplerParityTests / TileFeatureTests, which walk the same
// lattice with the C# sampler.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/terrain-checksum-golden.json';
import { CHECKSUM_SCAN, terrainChecksums, type TerrainChecksums } from './testing/terrainChecksums';

const fixture = goldenFixtureJson as unknown as {
  scan: { extent: number; stride: number };
  seeds: ({ seed: number } & TerrainChecksums)[];
};

describe('terrain-checksum golden fixture (terrain/orientation/variant parity)', () => {
  it('uses the scan this test walks', () => {
    expect(fixture.scan).toEqual(CHECKSUM_SCAN);
  });

  it.each(fixture.seeds)('seed=$seed: digests match', async ({ seed, ...expected }) => {
    expect(await terrainChecksums(seed)).toEqual(expected);
  }, 60_000);
});

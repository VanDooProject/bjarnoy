// Regenerates src/shared/island-shape-golden.json from the REAL frontend generator
// (src/frontend/src/lib/map/worldGenerator.ts). The C# side
// (IslandShapeGoldenTests) recomputes everything below with TerrainSampler and asserts it
// bit for bit: doubles are serialised with JS's shortest round-trip form, so an exact
// match proves the two generators evaluate every island the same way.
//
//   cd src/frontend && npx tsx ../../scripts/regen-goldens/island-shape-golden.ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { oddQToAxial } from '../../src/frontend/src/lib/hex/coords';
import {
  DEFAULT_GENERATION,
  enumerateIslandShapes,
  islandDepthAt,
  terrainAt,
  wastedDepthAt,
  wastedTerrainAt,
  type WorldGenerationConstants,
  type WorldSeed,
} from '../../src/frontend/src/lib/map/worldGenerator';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../src/shared/island-shape-golden.json');

// Same numbers as WorldGenerationOptions.Compact(seed, radius).
const COMPACT: WorldGenerationConstants = {
  ...DEFAULT_GENERATION,
  worldRadius: 300,
  islandCellSize: 90,
  islandMinWidth: 8,
  islandMaxWidth: 14,
  islandMinSegments: 3,
  islandMaxSegments: 5,
  islandMinElongation: 2,
  islandMaxElongation: 4,
  islandCoastWarp: 3,
  islandCoastWarpScale: 14,
  islandCoastNoise: 0.6,
  islandCoastNoiseScale: 16,
};

// Odd knobs on purpose: every island parameter differs from the default, so a knob that
// one side forgets to read shows up as a mismatch.
const ODD: WorldGenerationConstants = {
  ...DEFAULT_GENERATION,
  worldRadius: 1500,
  islandCellSize: 180,
  islandChance: 0.9,
  islandMinWidth: 12,
  islandMaxWidth: 27,
  islandMinSegments: 2,
  islandMaxSegments: 7,
  islandMinElongation: 1.5,
  islandMaxElongation: 6.5,
  islandMinBend: 0.05,
  islandMaxBend: 0.5,
  islandCoastWarp: 6,
  islandCoastWarpScale: 30,
  islandCoastNoise: 1.4,
  islandCoastNoiseScale: 31,
  islandSmallShare: 0.4,
  islandLargeShare: 0.2,
  beachThreshold: 0.85,
  mountainThreshold: 0.35,
};

// Radius 1000 keeps the fixture small (a radius-4000 world has ~280 islands); the full default
// radius is covered by terrain-checksum-golden.json.
const DEFAULT_1000: WorldGenerationConstants = { ...DEFAULT_GENERATION, worldRadius: 1000 };

const scenarios: { name: string; seed: number; generation: WorldGenerationConstants }[] = [
  { name: 'default_seed_11', seed: 11, generation: DEFAULT_1000 },
  { name: 'default_seed_6_with_wasted_islands', seed: 6, generation: DEFAULT_1000 },
  { name: 'default_negative_seed', seed: -7, generation: DEFAULT_1000 },
  { name: 'compact_seed_4242', seed: 4242, generation: COMPACT },
  { name: 'odd_knobs_seed_99', seed: 99, generation: ODD },
];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const result = scenarios.map(({ name, seed, generation }) => {
  const world: WorldSeed = { seed, generation };
  const rand = mulberry32(seed * 31 + 7);
  const shapes = enumerateIslandShapes(world).map((s) => ({
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
  const wastedShapes = enumerateIslandShapes(world, true).map((s) => ({
    cellCol: s.cellCol,
    cellRow: s.cellRow,
    cx: s.cx,
    cy: s.cy,
    reach: s.reach,
  }));

  // Sample points: around every island (so most are near or inside a coast), around the
  // wasted islands, and uniformly over the world (mostly sea, some beyond the world edge).
  const points: [number, number][] = [];
  const near = (cx: number, cy: number, spread: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const col = Math.round(cx + (rand() - 0.5) * 2 * spread);
      const row = Math.round(cy + (rand() - 0.5) * 2 * spread);
      const { q, r } = oddQToAxial({ col, row });
      points.push([q, r]);
    }
  };
  for (const s of shapes) near(s.cx, s.cy, s.reach, Math.max(8, Math.floor(400 / Math.max(1, shapes.length))));
  for (const s of wastedShapes) near(s.cx, s.cy, s.reach, 25);
  const span = generation.worldRadius * 1.1;
  for (let i = 0; i < 60; i++) near(0, 0, span, 1);

  const samples = points.map(([q, r]) => [
    q,
    r,
    islandDepthAt(q, r, world),
    wastedDepthAt(q, r, world),
    terrainAt(q, r, world),
    wastedTerrainAt(q, r, world),
  ]);
  return { name, seed, generation, shapes, wastedShapes, samples };
});

const doc = {
  _comment:
    'Cross-language parity fixture for the island shape (TerrainSampler.IslandShapeAt/EnumerateIslandShapes/IslandDepthAt/WastedDepthAt/TerrainAt/WastedTerrainAt backend / islandShapeAt/enumerateIslandShapes/islandDepthAt/wastedDepthAt/terrainAt/wastedTerrainAt frontend). Generated by scripts/regen-goldens/island-shape-golden.ts from the frontend generator: for each scenario (seed + generation constants) every island cell shape (spine, widths, islets, reach, size class, clamp factor, scan box), the wasted island cells, and depth/terrain at a few hundred sampled hexes (near islands, near wasted islands, and across the world including beyond its edge). Depths are compared exactly (bit for bit). IslandShapeGoldenTests.cs (backend) and islandShape.golden.test.ts (frontend) each recompute against it with their own implementation.',
  scenarios: result,
};
// One scenario field per line keeps diffs reviewable without a 10 MB pretty-print.
const lines = doc.scenarios.map((s) => '    ' + JSON.stringify(s));
writeFileSync(
  out,
  `{\n  "_comment": ${JSON.stringify(doc._comment)},\n  "scenarios": [\n${lines.join(',\n')}\n  ]\n}\n`,
);
console.log(`wrote ${out}`);
for (const s of result) console.log(s.name, 'shapes', s.shapes.length, 'wasted', s.wastedShapes.length, 'samples', s.samples.length);

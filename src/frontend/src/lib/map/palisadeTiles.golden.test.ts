// Anti-drift guard for the palisade: src/shared/palisade-golden.json (generated from palisadeTiles.ts by
// scripts/regen-goldens/palisade-golden.ts) is asserted here against the frontend resolver and by PalisadeGoldenTests.cs against
// Bjarnoy.Domain's Palisades/PalisadeRules.cs, so both sides agree on every piece, rotation, refusal and land-end classification.
import { describe, expect, it } from 'vitest';
import golden from '../../../../shared/palisade-golden.json';
import { coordKey, parseKey, type AxialCoord } from '../hex/coords';
import { canPlacePalisade, classifyEnd, isRefusal, palisadeTileFor } from './palisadeTiles';
import type { Terrain } from './types';

interface Fixture {
  tileCases: { wallNeighbours: boolean[]; coastalWater: boolean; gate: boolean; expected: Record<string, unknown> }[];
  placementCases: {
    name: string;
    terrain: Record<string, Terrain>;
    rivers: string[];
    walls: string[];
    gates: string[];
    coord: string;
    gate: boolean;
    expected: { ok: true } | { reason: string };
  }[];
  classifyEndCases: { name: string; terrain: Record<string, Terrain>; wideRivers: string[]; coord: string; expected: string }[];
}
const fixture = golden as unknown as Fixture;

describe('palisade golden fixture (backend parity)', () => {
  it.each(fixture.tileCases.map((c, i) => [i, c] as const))('tile case %i resolves as frozen', (_i, c) => {
    const result = palisadeTileFor({ wallNeighbours: c.wallNeighbours, coastalWater: c.coastalWater, gate: c.gate });
    expect(isRefusal(result) ? { refusal: result.refusal } : { piece: result.piece, dir: result.dir, edges: result.edges }).toEqual(c.expected);
  });

  it.each(fixture.placementCases)('placement $name', (c) => {
    const result = canPlacePalisade(
      parseKey(c.coord),
      { walls: new Set(c.walls), gates: new Set(c.gates) },
      { terrainAt: (h: AxialCoord) => c.terrain[coordKey(h)] ?? 'grass', isRiver: (h: AxialCoord) => c.rivers.includes(coordKey(h)) },
      { gate: c.gate },
    );
    expect(result.ok ? { ok: true } : { reason: result.reason }).toEqual(c.expected);
  });

  it.each(fixture.classifyEndCases)('end $name', (c) => {
    expect(classifyEnd(parseKey(c.coord), (h) => c.terrain[coordKey(h)] ?? 'grass', (h) => c.wideRivers.includes(coordKey(h)))).toBe(c.expected);
  });
});

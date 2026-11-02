// Regenerates src/shared/palisade-golden.json from the frontend resolver (palisadeTiles.ts).
//   cd src/frontend && npx tsx ../../scripts/regen-goldens/palisade-golden.ts
// The wall layouts and cases below are the INPUTS; every expected piece, rotation, refusal and end classification is computed here by the
// frontend implementation and then asserted independently by PalisadeGoldenTests.cs (backend, Palisades/PalisadeRules.cs) and
// palisadeTiles.golden.test.ts (frontend), so the two resolvers and the placement rules cannot drift.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coordKey, parseKey, type AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import { canPlacePalisade, classifyEnd, isRefusal, palisadeTileFor } from '../../src/frontend/src/lib/map/palisadeTiles';
import type { Terrain } from '../../src/frontend/src/lib/map/types';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/shared/palisade-golden.json');

// 1. Every wall-neighbour pattern (2^6) x land/coastal water x plain/gate: the piece, its camera file and the edges it runs into, or the refusal.
const tileCases = [];
for (let mask = 0; mask < 64; mask++) {
  const wallNeighbours = Array.from({ length: 6 }, (_, d) => (mask & (1 << d)) !== 0);
  for (const coastalWater of [false, true]) {
    for (const gate of [false, true]) {
      const result = palisadeTileFor({ wallNeighbours, coastalWater, gate });
      tileCases.push({
        wallNeighbours,
        coastalWater,
        gate,
        expected: isRefusal(result) ? { refusal: result.refusal } : { piece: result.piece, dir: result.dir, edges: result.edges },
      });
    }
  }
}

// 2. Placements: a small map (everything grass unless listed), the wall as it stands, and one hex to add.
interface PlacementInput {
  name: string;
  comment: string;
  terrain?: Record<string, Terrain>;
  rivers?: string[];
  plainBog?: string[];
  walls?: string[];
  gates?: string[];
  coord: string;
  gate?: boolean;
}
const placementInputs: PlacementInput[] = [
  { name: 'first_hex_on_grass', comment: 'An isolated wall hex is "not drawable yet", not an error.', coord: '0,0' },
  { name: 'forest_is_allowed', comment: 'Forest takes a wall.', terrain: { '0,0': 'forest' }, coord: '0,0' },
  { name: 'sand_is_allowed', comment: 'Sand takes a wall.', terrain: { '0,0': 'sand' }, coord: '0,0' },
  { name: 'mountain_is_refused', comment: 'No wall on a mountain.', terrain: { '0,0': 'mountain' }, coord: '0,0' },
  { name: 'bog_is_refused', comment: 'No wall on a bog.', terrain: { '0,0': 'bog' }, coord: '0,0' },
  { name: 'plain_bog_is_allowed', comment: 'Plain bog moss takes a wall.', terrain: { '0,0': 'bog' }, plainBog: ['0,0'], coord: '0,0' },
  { name: 'bog_shore_is_refused', comment: 'A bog shore, mouth or lake-side hex (bog that is not plain moss) takes none.', terrain: { '0,0': 'bog' }, coord: '0,0' },
  { name: 'bog_creek_is_refused', comment: 'A creek is bog too, but not plain moss.', terrain: { '0,0': 'bog' }, coord: '0,0' },
  { name: 'wall_extends_over_plain_bog', comment: 'A wall runs on from grass onto plain moss.', terrain: { '1,0': 'bog' }, plainBog: ['1,0'], walls: ['0,0'], coord: '1,0' },
  { name: 'lake_is_refused', comment: 'No wall on a bog lake.', terrain: { '0,0': 'lake' }, coord: '0,0' },
  { name: 'river_hex_is_refused', comment: 'No wall on any river tile, wide or not.', rivers: ['0,0'], coord: '0,0' },
  { name: 'open_sea_without_a_wall_is_refused', comment: 'A sea hex only ever carries the sea end, hanging off exactly one land wall.', terrain: { '0,0': 'sea' }, coord: '0,0' },
  { name: 'occupied_hex_is_refused', comment: 'A wall hex already stands there.', walls: ['0,0'], coord: '0,0' },
  { name: 'extending_an_end_makes_a_straight', comment: 'Two wall hexes in a line.', walls: ['0,0', '1,0'], coord: '2,0' },
  { name: 'closing_a_gap_makes_a_straight', comment: 'Two arms with a hole between them.', walls: ['0,0', '2,0'], coord: '1,0' },
  { name: 'a_bend_is_allowed', comment: 'A turn is fine for a plain wall.', walls: ['0,0', '1,0'], coord: '1,-1' },
  { name: 'a_third_arm_is_a_branch', comment: 'Three wall neighbours around the new hex.', walls: ['0,0', '2,0', '1,-1'], coord: '1,0', },
  { name: 'a_hex_next_to_a_straight_branches_it', comment: 'The middle of a straight would get a third neighbour.', walls: ['0,0', '1,0', '2,0'], coord: '1,-1' },
  { name: 'gate_on_a_straight', comment: 'A gate between two opposite wall hexes.', walls: ['0,0', '2,0'], coord: '1,0', gate: true },
  { name: 'gate_on_a_tight_bend_is_refused', comment: 'Adjacent edges: bend60, no gate.', walls: ['0,0', '1,-1'], coord: '1,0', gate: true },
  { name: 'gate_on_a_wide_bend_is_refused', comment: 'One edge skipped: bend120, no gate.', walls: ['0,0', '2,-1'], coord: '1,0', gate: true },
  { name: 'gate_with_no_neighbours_is_refused', comment: 'A gate needs a straight.', coord: '1,0', gate: true },
  { name: 'gate_at_a_wall_end_is_refused', comment: 'One neighbour is an end, not a straight.', walls: ['0,0'], coord: '1,0', gate: true },
  { name: 'gate_replaces_a_straight', comment: 'Upgrading a standing straight into a gate.', walls: ['0,0', '1,0', '2,0'], coord: '1,0', gate: true },
  { name: 'gate_on_water_is_refused', comment: 'A gate is never a sea end.', terrain: { '1,0': 'sea' }, walls: ['0,0'], coord: '1,0', gate: true },
  { name: 'wall_next_to_a_gate_branches_it', comment: 'A third neighbour for a gate.', walls: ['0,0', '1,0', '2,0'], gates: ['1,0'], coord: '1,-1' },
  { name: 'wall_that_turns_a_waiting_gate_is_refused', comment: 'A gate with one neighbour so far must stay straight.', walls: ['0,0', '1,0'], gates: ['1,0'], coord: '1,-1' },
  { name: 'wall_that_extends_a_waiting_gate_is_ok', comment: 'The second neighbour opposite the first.', walls: ['0,0', '1,0'], gates: ['1,0'], coord: '2,0' },
  { name: 'sea_end_on_coastal_water', comment: 'The sea end hangs off one land wall hex.', terrain: { '2,0': 'sea' }, walls: ['0,0', '1,0'], coord: '2,0' },
  { name: 'sea_end_touching_two_walls_is_a_branch', comment: 'A sea hex between two wall hexes.', terrain: { '2,0': 'sea' }, walls: ['1,0', '2,-1'], coord: '2,0' },
  { name: 'sea_end_without_a_wall_is_refused', comment: 'Nothing to hang off.', terrain: { '2,0': 'sea' }, walls: ['0,0'], coord: '2,0' },
  { name: 'sea_end_off_a_sea_wall_is_refused', comment: 'The only wall neighbour is itself on water.', terrain: { '2,0': 'sea', '1,0': 'sea' }, walls: ['1,0'], coord: '2,0' },
  { name: 'second_wall_next_to_a_sea_end_is_a_branch', comment: 'A sea end takes exactly one land wall.', terrain: { '2,0': 'sea' }, walls: ['0,0', '1,0', '2,0'], coord: '2,-1' },
];

const placementCases = placementInputs.map((c) => {
  const terrain = c.terrain ?? {};
  const rivers = new Set(c.rivers ?? []);
  const plainBog = new Set(c.plainBog ?? []);
  const result = canPlacePalisade(
    parseKey(c.coord),
    { walls: new Set(c.walls ?? []), gates: new Set(c.gates ?? []) },
    {
      terrainAt: (h: AxialCoord) => terrain[coordKey(h)] ?? 'grass',
      isRiver: (h: AxialCoord) => rivers.has(coordKey(h)),
      isPlainBog: (h: AxialCoord) => plainBog.has(coordKey(h)),
    },
    { gate: c.gate ?? false },
  );
  return { ...c, terrain, rivers: [...rivers], plainBog: [...plainBog], walls: c.walls ?? [], gates: c.gates ?? [], gate: c.gate ?? false, expected: result.ok ? { ok: true } : { reason: result.reason } };
});

// 3. Land ends: sealed against a mountain or a wide river, otherwise half open (the sea included).
interface EndInput {
  name: string;
  comment: string;
  terrain?: Record<string, Terrain>;
  wideRivers?: string[];
  coord: string;
}
const endInputs: EndInput[] = [
  { name: 'open_grass_end', comment: 'Nothing special around it.', coord: '0,0' },
  { name: 'end_on_the_coast', comment: 'Sea beside the tip leaves it half open.', terrain: { '1,0': 'sea', '1,-1': 'sea' }, coord: '0,0' },
  { name: 'end_beside_a_mountain', comment: 'A mountain neighbour seals it.', terrain: { '0,1': 'mountain' }, coord: '0,0' },
  { name: 'end_beside_a_wide_river', comment: 'A wide river neighbour seals it.', wideRivers: ['-1,0'], coord: '0,0' },
  { name: 'end_beside_a_mountain_two_away', comment: 'Only direct neighbours count.', terrain: { '2,0': 'mountain' }, coord: '0,0' },
  { name: 'end_beside_a_lake', comment: 'A lake is not a barrier for this rule.', terrain: { '0,1': 'lake' }, coord: '0,0' },
];
const classifyEndCases = endInputs.map((c) => {
  const terrain = c.terrain ?? {};
  const wide = new Set(c.wideRivers ?? []);
  const result = classifyEnd(parseKey(c.coord), (h) => terrain[coordKey(h)] ?? 'grass', (h) => wide.has(coordKey(h)));
  return { ...c, terrain, wideRivers: [...wide], expected: result };
});

const doc = {
  _comment:
    'Anti-drift guard for the palisade: which piece and camera a wall hex draws (palisadeTiles.ts palisadeTileFor / Bjarnoy.Domain Palisades/PalisadeRules.TileFor), which placements are accepted or refused and why (canPlacePalisade / PalisadeRules.CanPlace) and which land ends are half open or sealed (classifyEnd / PalisadeRules.IsSealedEnd). Generated by scripts/regen-goldens/palisade-golden.ts from the frontend resolver; never hand-edit. wallNeighbours are in neighbors() direction order (E, NE, NW, W, SW, SE); dir is the art camera file (_E ... _SE); edges are direction indices. Terrain not listed is grass.',
  tileCases,
  placementCases,
  classifyEndCases,
};
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
console.log(`wrote ${out} (${tileCases.length} tile, ${placementCases.length} placement, ${classifyEndCases.length} end cases)`);

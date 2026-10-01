// Regenerates src/shared/river-pathing-golden.json from the frontend pathfinder (hexPath.ts) and wide-river rule (isWideRiverTile, riverGenerator.ts).
//   cd src/frontend && npx tsx ../../scripts/regen-goldens/river-pathing-golden.ts
// The terrain patches, river tiles and cases below are the INPUTS; every expected path and hour figure is computed here by the
// frontend implementation and then asserted independently by HexPathfinderGoldenTests.cs (backend) and hexPath.golden.test.ts.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coordKey, type AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import { findPath, hoursFrom, pathCost, reachableRange, type PathContext } from '../../src/frontend/src/lib/map/hexPath';
import { palisadeRestrictions, type PalisadeWalls } from '../../src/frontend/src/lib/map/palisadeMovement';
import { isWideRiverTile } from '../../src/frontend/src/lib/map/riverGenerator';
import type { RiverTile, Terrain } from '../../src/frontend/src/lib/map/types';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/shared/river-pathing-golden.json');

// Terrain: any hex not listed is sea. Patches are 1000 hexes apart in spirit (distinct q ranges) so a search never leaks between them.
const terrain: Record<string, Terrain> = {};
const put = (q: number, r: number, t: Terrain) => (terrain[`${q},${r}`] = t);

// 0..2: a one-hex corridor with a stream in the middle (the only way over).
for (const q of [0, 1, 2]) put(q, 0, 'grass');
// 10..12: a stream with a two-hex grass detour around it.
for (const [q, r] of [[10, 0], [11, 0], [11, -1], [12, -1], [12, 0]] as const) put(q, r, 'grass');
// 20..23: two mountain hexes between the endpoints, with a grass detour above them.
for (const [q, r, t] of [[20, 0, 'grass'], [21, 0, 'mountain'], [22, 0, 'mountain'], [23, 0, 'grass'], [21, -1, 'grass'], [22, -1, 'grass'], [23, -1, 'grass']] as const) put(q, r, t);
// 30..32: a mountain between the endpoints and no way round.
for (const [q, t] of [[30, 'grass'], [31, 'mountain'], [32, 'grass']] as const) put(q, 0, t);
// 40..42: a stream running over the mountain in the middle (walkable at a flat 9).
for (const [q, t] of [[40, 'grass'], [41, 'mountain'], [42, 'grass']] as const) put(q, 0, t);
// 50..52: a wide river between the endpoints and no way round.
for (const q of [50, 51, 52]) put(q, 0, 'grass');
// 60..62: a river-stream Y (a stream joining a river) between the endpoints; its two feeders are the only other land.
for (const [q, r] of [[60, 0], [61, 0], [62, 0], [61, -1], [60, 1]] as const) put(q, r, 'grass');

// Palisades: four strips (q0 .. q0+6, r -3..3, everything else sea) with a wall down the column q0+3; the endpoints are (q0+1, 0) and (q0+5, 0).
// 70: a wall closed at both ends by a mountain, with a gate in the middle (owner A's). 80: the same without the gate.
// 90: a wall that stops one hex short of the sea at the bottom (half-open end, crossed at a flat 3), a mountain closing the top.
// 100: the same wall, but a mountain at the bottom end seals it.
const walls: { q: number; r: number; gate?: boolean }[] = [];
const wallStrip = (q0: number, fromR: number, toR: number, mountainTop: boolean, bottom: 'mountainBelow' | 'mountainAtTip' | 'sea', gateAtR?: number) => {
  for (let q = q0; q <= q0 + 6; q++) for (let r = -3; r <= 3; r++) put(q, r, 'grass');
  if (mountainTop) put(q0 + 3, -4, 'mountain');
  if (bottom === 'mountainBelow') put(q0 + 3, 4, 'mountain');
  if (bottom === 'mountainAtTip') put(q0 + 3, 3, 'mountain');
  if (bottom === 'sea') delete terrain[`${q0 + 3},3`];
  for (let r = fromR; r <= toR; r++) walls.push(r === gateAtR ? { q: q0 + 3, r, gate: true } : { q: q0 + 3, r });
};
wallStrip(70, -3, 3, true, 'mountainBelow', 0);
wallStrip(80, -3, 3, true, 'mountainBelow');
wallStrip(90, -3, 2, true, 'sea');
wallStrip(100, -3, 2, true, 'mountainAtTip');
// Walls belong to this owner; an "enemy" army is any other.
const OWNER = 'owner-a';
const wallMap: PalisadeWalls = new Map(walls.map((w) => [coordKey(w), { gate: w.gate ?? false, owner: OWNER }]));

const tile = (q: number, r: number, shape: RiverTile['shape'], width: RiverTile['width'], inDirections: RiverTile['inDirections'], outDirection: RiverTile['outDirection']): RiverTile => ({
  q, r, shape, width, inDirections, outDirection,
});
const riverTiles: RiverTile[] = [
  tile(1, 0, 'straight', 'stream', ['W'], 'E'),
  tile(11, 0, 'straight', 'stream', ['W'], 'E'),
  tile(41, 0, 'straight', 'stream', ['W'], 'E'),
  tile(51, 0, 'straight', 'river', ['W'], 'E'),
  // The Y: a river feeds it from the NW, a stream from the SW, the river flows out east.
  tile(61, -1, 'straight', 'river', [], 'SE'),
  tile(60, 1, 'spring', 'stream', [], 'NE'),
  tile(61, 0, 'confluence', 'riverstream', ['NW', 'SW'], 'E'),
];

const riverByKey = new Map(riverTiles.map((t) => [coordKey(t), t]));
const riverAt = (c: AxialCoord) => riverByKey.get(coordKey(c));
const terrainAt = (c: AxialCoord): Terrain => terrain[coordKey(c)] ?? 'sea';
const isWideRiver = (c: AxialCoord) => {
  const t = riverAt(c);
  return t !== undefined && isWideRiverTile(t, riverAt);
};
/** The context for an army: `friendly` is the wall owner's, anything else an enemy's. */
const contextFor = (army: 'friendly' | 'enemy'): PathContext => ({
  terrainAt,
  isRiver: (c) => riverByKey.has(coordKey(c)),
  isWideRiver,
  rules: { land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0 }, riverCrossingCost: 8.0 },
  hexesPerHour: 1,
  restrictions: palisadeRestrictions(wallMap, terrainAt, isWideRiver, army === 'friendly' ? OWNER : 'someone-else'),
});

interface CaseInput {
  name: string;
  comment: string;
  from: AxialCoord;
  to: AxialCoord;
  /** Whose army walks: the wall owner's (default) or an enemy's. Only matters where a wall stands. */
  army?: 'friendly' | 'enemy';
}
const caseInputs: CaseInput[] = [
  {
    name: 'stream_crossing_no_detour_available',
    comment: 'A single grass corridor with a stream tile in the middle and nothing else reachable (everywhere else is sea): a stream is walkable at a flat 1.0 + 8.0 = 9.0.',
    from: { q: 0, r: 0 },
    to: { q: 2, r: 0 },
  },
  {
    name: 'stream_detour_preferred_over_crossing',
    comment: 'Same stream shape as above, but this time a 2-hex grass detour exists - cheaper than paying the 9.0 crossing, so the router goes around.',
    from: { q: 10, r: 0 },
    to: { q: 12, r: 0 },
  },
  {
    name: 'mountains_are_impassable_so_the_grass_detour_is_taken',
    comment: 'No river involved: the direct 3-hop route crosses two mountain hexes, which a land army cannot enter; the 4-hop all-grass detour (4.0h) is the only route.',
    from: { q: 20, r: 0 },
    to: { q: 23, r: 0 },
  },
  {
    name: 'mountain_with_no_way_round_has_no_route',
    comment: 'One mountain hex between the endpoints and sea everywhere else: impassable, so there is no route.',
    from: { q: 30, r: 0 },
    to: { q: 32, r: 0 },
  },
  {
    name: 'stream_on_a_mountain_costs_a_flat_9',
    comment: 'A stream tile runs over the mountain hex between the endpoints: walkable at a flat 1.0 + 8.0 = 9.0 (not the mountain terrain cost plus 8.0), and it is the only way.',
    from: { q: 40, r: 0 },
    to: { q: 42, r: 0 },
  },
  {
    name: 'wide_river_is_impassable',
    comment: 'A river-width tile (river in, river out) between the endpoints and no way round: a wide river cannot be crossed, so there is no route.',
    from: { q: 50, r: 0 },
    to: { q: 52, r: 0 },
  },
  {
    name: 'river_stream_confluence_is_wide_and_impassable',
    comment: 'A Y where a stream joins a river (two river-width arms, one stream arm) is part of the wide river: no route across it, and the feeders (a river-width tile and a stream) lead nowhere else.',
    from: { q: 60, r: 0 },
    to: { q: 62, r: 0 },
  },
  {
    name: 'wall_with_a_gate_stops_an_enemy',
    comment: 'A wall closed by a mountain at both ends with a gate in the middle (every wall hex, the gate included, blocks an army that is not its owner\'s): no route.',
    from: { q: 71, r: 0 },
    to: { q: 75, r: 0 },
    army: 'enemy',
  },
  {
    name: 'wall_with_a_gate_lets_the_owner_through',
    comment: 'The same wall: the owner\'s army walks through its own gate at the normal terrain cost (four grass steps, 4.0).',
    from: { q: 71, r: 0 },
    to: { q: 75, r: 0 },
    army: 'friendly',
  },
  {
    name: 'wall_without_a_gate_stops_the_owner_too',
    comment: 'A wall with no gate, closed by a mountain at both ends: every wall hex blocks every army, the owner\'s included.',
    from: { q: 81, r: 0 },
    to: { q: 85, r: 0 },
    army: 'friendly',
  },
  {
    name: 'half_open_end_is_crossed_by_an_enemy_at_3',
    comment: 'A wall that stops one hex short of the sea: its land end touches no mountain or wide river, so it is half open and an enemy crosses it at a flat 3.0 (instead of 1.0).',
    from: { q: 91, r: 0 },
    to: { q: 95, r: 0 },
    army: 'enemy',
  },
  {
    name: 'half_open_end_is_crossed_by_the_owner_at_3',
    comment: 'The same half-open end: the owner pays the same flat 3.0.',
    from: { q: 91, r: 0 },
    to: { q: 95, r: 0 },
    army: 'friendly',
  },
  {
    name: 'sealed_end_beside_a_mountain_blocks',
    comment: 'The same wall with a mountain beside its tip: a sealed end blocks like any wall hex, so there is no route.',
    from: { q: 101, r: 0 },
    to: { q: 105, r: 0 },
    army: 'enemy',
  },
];

const findPathCases = caseInputs.map((raw) => {
  const { army = 'friendly', ...c } = raw;
  const ctx = contextFor(army);
  const path = findPath(c.from, c.to, ctx);
  const hours = hoursFrom(c.from, ctx, Number.POSITIVE_INFINITY);
  if (path === null) {
    if (hours.has(coordKey(c.to))) throw new Error(`${c.name}: findPath found no route but hoursFrom reaches the target`);
    return { ...c, army, isLandUnit: true, expectedPath: null, expectedCumulativeHours: null };
  }
  const cumulative = path.map((_, i) => pathCost(path.slice(0, i + 1), ctx));
  if (Math.abs(cumulative.at(-1)! - (hours.get(coordKey(c.to)) ?? NaN)) > 1e-9) throw new Error(`${c.name}: findPath and hoursFrom disagree`);
  return { ...c, army, isLandUnit: true, expectedPath: path.map(({ q, r }) => ({ q, r })), expectedCumulativeHours: cumulative };
});

const rangeInputs = [
  { name: 'ordinary_dispatch_stream_detour_patch', comment: 'origin === home (an ordinary dispatch, not a field order): the reachable set from (10,0) with 6h of food, over the stream-detour patch above.', origin: { q: 10, r: 0 }, hoursOfFood: 6 },
  { name: 'mountain_wall_range', comment: 'Mountains are impassable: from (30,0) with plenty of food only the origin itself is reachable, neither the mountain nor the hex beyond it.', origin: { q: 30, r: 0 }, hoursOfFood: 100 },
  { name: 'stream_on_a_mountain_range', comment: 'A stream over a mountain is walkable at 9.0 each way: from (40,0) with 30h of food the stream hex costs 18 round trip and the hex beyond it 20.', origin: { q: 40, r: 0 }, hoursOfFood: 30 },
];
const reachableRangeCases = rangeInputs.map((c) => {
  const range = reachableRange(c.origin, c.origin, c.hoursOfFood, contextFor('friendly'));
  const expectedReachable = [...range.entries()]
    .map(([key, hours]) => {
      const [q, r] = key.split(',').map(Number) as [number, number];
      return { q, r, hours };
    })
    .sort((a, b) => a.q - b.q || a.r - b.r);
  return { ...c, home: c.origin, expectedReachable };
});

const doc = {
  _comment:
    "Issue #159 part B's anti-drift guard, updated for the movement rules (wide rivers and mountains impassable to land armies, a stream - any river tile that is not wide - walkable at a flat 1.0 + RiverCrossingCost = 9.0 whatever terrain it runs over). HexPathfinderGoldenTests.cs (backend) and hexPath.golden.test.ts (frontend) both compute against this fixture using each side's OWN production cost tables and wide-river rule (RiverArms.cs / riverArms.ts, from the full river tiles below), then assert the frozen results. Either side's cost model drifting from the other turns its own suite red, instead of the client's range tint quietly disagreeing with what the server actually paths over. Generated by scripts/regen-goldens/river-pathing-golden.ts from the frontend pathfinder; never hand-edit. walls are the standing palisade hexes (an army with case.army 'friendly' belongs to the wall owner, 'enemy' to anyone else; the default is friendly): every wall hex blocks, a gate passes only its owner's armies, a land end with one wall neighbour that touches no mountain or wide river is half open at a flat 3.0 (HexPathfinder.HalfOpenEndCost / HALF_OPEN_END_COST). terrain omits sea - any (q, r) not listed is sea (impassable to a land unit). A case with expectedPath null has no route. hexesPerHour/speedFactor are always 1.0 in these cases so every hour figure below is a plain sum of step costs.",
  terrain,
  riverTiles,
  walls: walls.map((w) => ({ q: w.q, r: w.r, gate: w.gate ?? false, owner: OWNER })),
  findPathCases,
  reachableRangeCases,
};
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
console.log(`wrote ${out} (${findPathCases.length} path cases, ${reachableRangeCases.length} range cases)`);

// The `pathing` preview: renders a world window from the real generator with the owner's decided
// movement rules applied, so the palisade rules and the new pathing rules can be checked on example
// renders before anything changes in the game.
//
//   cd src/frontend && npm run worldgen-pathing -- ../../scripts/worldgen-preview/scenarios/c-sea-end-seals.json --out c.png
//   npm run worldgen-pathing -- --all --out-dir /tmp/pathing
//
// A scenario (scenarios/*.json, see README.md) names a seed, a window, palisade hexes, gates and
// origin/destination pairs tagged friendly or enemy. It draws terrain (mountains hatched, wide
// rivers thick and dark, streams thin and light), every palisade hex as the real centreline of its
// piece in the rotation `palisadeTiles.ts` picks, the A* route of every pair (friendly green, enemy
// red) or a NO ROUTE marker, and optionally a faint tint over everything reachable from a route's
// origin. The footer prints each route's length and cost, or "no route".
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { coordKey, hexDistance, neighbors, parseKey, type AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import { findPath, pathCost, reachableFrom, type PathContext } from '../../src/frontend/src/lib/map/hexPath';
import {
  canPlacePalisade,
  isRefusal,
  resolveWall,
  type PalisadePiece,
  type PalisadeRefusal,
  type PalisadeResult,
  type PalisadeTile,
  type PlacementContext,
  type WallSet,
} from '../../src/frontend/src/lib/map/palisadeTiles';
import { DEFAULT_GENERATION, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import type { RiverTile, Terrain } from '../../src/frontend/src/lib/map/types';
import { BOG_COLOUR, LAKE_COLOUR, riverColourAt, TERRAIN_COLOURS, type Layer, type LegendEntry, type OverlayCanvas, type Rgb } from './layers';
import { buildPathingWorld, pathContext, type PathingWorld } from './pathing-world';
import { renderPreview } from './render';

// ---- the scenario file ---------------------------------------------------------------

type Pair = [number, number];

export interface ScenarioRoute {
  from: Pair;
  to: Pair;
  army: 'friendly' | 'enemy';
  /** A short mark drawn at the origin (and with a ' at the destination); default A, B, C... */
  label?: string;
}

export interface Scenario {
  name: string;
  /** One line under the footer's heading: what the picture shows. */
  title?: string;
  seed: number;
  radius: number;
  window: { q: number; r: number; size: number };
  /** Pixels per hex circumradius (default 22). */
  px?: number;
  /** Palisade hexes, placed one by one in this order (a sea hex at the end of the line is the sea end). */
  walls?: Pair[];
  /** Polylines of corners; every hex on the straight hex lines between consecutive corners is a wall hex. Placed before `walls`. */
  wallLines?: Pair[][];
  /** Wall hexes that are gates (upgraded once the wall is placed). */
  gates?: Pair[];
  /** Extra placements tried after the wall is built (`[q, r]` or `[q, r, "gate"]`): accepted ones join the wall, refused ones are marked with the reason. */
  attempts?: (Pair | [number, number, 'gate'])[];
  routes?: ScenarioRoute[];
  /** The owner's rules, each on by default: wide rivers and mountains impassable. Turn one off to compare. */
  rules?: { wideRivers?: boolean; mountains?: boolean; palisade?: boolean; /** coastal water touching a palisade land end is wadeable (default on) */ wadeEnds?: boolean };
  /** Tint everything reachable from route N's origin (0-based) with route N's army's rules. */
  flood?: number | boolean;
  /** Print the piece and camera on every wall hex. */
  labels?: boolean;
}

export function parseScenario(text: string, fileName = 'scenario'): Scenario {
  const raw = JSON.parse(text) as Partial<Scenario>;
  const fail = (m: string): never => {
    throw new Error(`${fileName}: ${m}`);
  };
  if (typeof raw.name !== 'string' || raw.name === '') fail('needs a "name"');
  if (!Number.isFinite(raw.seed) || !Number.isFinite(raw.radius)) fail('needs numeric "seed" and "radius"');
  const w = raw.window;
  if (!w || !Number.isFinite(w.q) || !Number.isFinite(w.r) || !Number.isFinite(w.size) || w.size < 1) fail('needs a "window" {q, r, size}');
  const isPair = (p: unknown): boolean => Array.isArray(p) && p.length >= 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]);
  for (const list of [raw.walls, raw.gates, raw.attempts]) if (list && !list.every(isPair)) fail('hexes are [q, r] pairs of integers');
  if (raw.wallLines && !raw.wallLines.every((l) => Array.isArray(l) && l.every(isPair))) fail('"wallLines" are lists of [q, r] corners');
  for (const route of raw.routes ?? []) {
    if (!isPair(route.from) || !isPair(route.to)) fail('a route needs "from" and "to" as [q, r]');
    if (route.army !== 'friendly' && route.army !== 'enemy') fail(`a route's "army" is friendly or enemy, got "${route.army}"`);
  }
  return raw as Scenario;
}

// ---- hex lines and the wall --------------------------------------------------------------

/** The hexes on the straight line from a to b, ends included (cube-coordinate lerp). */
export function hexLine(a: AxialCoord, b: AxialCoord): AxialCoord[] {
  const n = hexDistance(a, b);
  const out: AxialCoord[] = [];
  const round = (q: number, r: number): AxialCoord => {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  };
  // A nudge keeps ties off the hex edges, the usual hex-line trick.
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push(round(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 2e-6));
  }
  return out;
}

const pair = (p: readonly (number | string)[]): AxialCoord => ({ q: p[0] as number, r: p[1] as number });

export interface Refused {
  q: number;
  r: number;
  reason: PalisadeRefusal;
  gate: boolean;
}

export interface RouteResult {
  route: ScenarioRoute;
  label: string;
  path: AxialCoord[] | null;
  cost: number | null;
  /** The same pair under the backend's current rules (no new restrictions, no wall). */
  before: { length: number; cost: number } | null;
  /** Why there is no route when there is none for a reason other than the rules (an endpoint that is not land). */
  note?: string;
}

export interface ScenarioRun {
  scenario: Scenario;
  pw: PathingWorld;
  wall: WallSet;
  tiles: Map<string, PalisadeResult>;
  refused: Refused[];
  routes: RouteResult[];
  flood: Set<string> | null;
  /** Coastal water a land army may wade: sea hexes touching a land `palisade_end`. */
  wadeable: Set<string>;
}

/** Places the scenario's wall hex by hex with `canPlacePalisade`; refusals are recorded, not thrown. */
export function placeWall(scn: Scenario, pw: PathingWorld): { wall: WallSet; refused: Refused[] } {
  const ctx: PlacementContext = { terrainAt: pw.terrainAt, isRiver: pw.isRiver, isWideRiver: pw.isWideRiver };
  const walls = new Set<string>();
  const gates = new Set<string>();
  const refused: Refused[] = [];
  const state = (): WallSet => ({ walls, gates });
  const place = (c: AxialCoord, gate: boolean): void => {
    const verdict = canPlacePalisade(c, state(), ctx, { gate });
    if (!verdict.ok) {
      refused.push({ q: c.q, r: c.r, reason: verdict.reason, gate });
      return;
    }
    walls.add(coordKey(c));
    if (gate) gates.add(coordKey(c));
  };

  const order: AxialCoord[] = [];
  for (const line of scn.wallLines ?? []) {
    for (let i = 0; i + 1 < line.length; i++) {
      for (const c of hexLine(pair(line[i]!), pair(line[i + 1]!))) if (!order.some((o) => o.q === c.q && o.r === c.r)) order.push(c);
    }
  }
  for (const w of scn.walls ?? []) order.push(pair(w));
  for (const c of order) if (!walls.has(coordKey(c))) place(c, false);
  for (const g of scn.gates ?? []) place(pair(g), true);
  for (const a of scn.attempts ?? []) place(pair(a), a[2] === 'gate');
  return { wall: state(), refused };
}

/** Sea hexes (not wall hexes) next to a wall hex that resolved as a land end: the only water land armies wade. */
export function wadeableWater(wall: WallSet, tiles: Map<string, PalisadeResult>, pw: PathingWorld): Set<string> {
  const out = new Set<string>();
  for (const [key, tile] of tiles) {
    if (isRefusal(tile) || tile.piece !== 'end') continue;
    for (const n of neighbors(parseKey(key))) {
      if (pw.terrainAt(n) === 'sea' && !wall.walls.has(coordKey(n))) out.add(coordKey(n));
    }
  }
  return out;
}

function contextFor(scn: Scenario, pw: PathingWorld, wall: WallSet, army: 'friendly' | 'enemy'): PathContext {
  const rules = scn.rules ?? {};
  const wade = (rules.wadeEnds ?? true) && (rules.palisade ?? true) ? wadeableWater(wall, resolveWall(wall, pw.terrainAt, parseKey), pw) : null;
  const walls = wall.walls;
  const gates = wall.gates ?? new Set<string>();
  const palisade = rules.palisade ?? true;
  return pathContext(pw, {
    wideRiversImpassable: rules.wideRivers ?? true,
    mountainsImpassable: rules.mountains ?? true,
    blocked: palisade ? (c) => walls.has(coordKey(c)) : undefined,
    friendlyGate: army === 'friendly' ? (c) => gates.has(coordKey(c)) : undefined,
    wadeable: wade ? (c) => wade.has(coordKey(c)) : undefined,
  });
}

export function runScenario(scn: Scenario, pw?: PathingWorld): ScenarioRun {
  const world: WorldSeed = { seed: scn.seed, generation: { ...DEFAULT_GENERATION, worldRadius: scn.radius } };
  const world2 = pw ?? buildPathingWorld(world, scn.window);
  const { wall, refused } = placeWall(scn, world2);
  const tiles = resolveWall(wall, world2.terrainAt, parseKey);

  const old: PathContext = { ...pathContext(world2), restrictions: undefined };
  const routes: RouteResult[] = (scn.routes ?? []).map((route, i) => {
    const from = pair(route.from);
    const to = pair(route.to);
    const ctx = contextFor(scn, world2, wall, route.army);
    const path = findPath(from, to, ctx);
    const before = findPath(from, to, old);
    const result: RouteResult = {
      route,
      label: route.label ?? String.fromCharCode(65 + i),
      path,
      cost: path ? pathCost(path, ctx) : null,
      before: before ? { length: before.length, cost: pathCost(before, old) } : null,
    };
    // A route that cannot start or end where it is asked to is not a verdict on the wall: say why.
    for (const [what, c] of [['origin', from], ['destination', to]] as const) {
      const t = world2.terrainAt(c);
      if (t === 'sea' || t === 'lake') result.note = `${what} is ${t}`;
      else if (t === 'mountain' && (scn.rules?.mountains ?? true)) result.note = `${what} is a mountain`;
      else if (world2.isWideRiver(c) && (scn.rules?.wideRivers ?? true)) result.note = `${what} is a wide river`;
      else if (wall.walls.has(coordKey(c)) && (scn.rules?.palisade ?? true) && !(route.army === 'friendly' && wall.gates?.has(coordKey(c)))) {
        result.note = `${what} is a palisade hex`;
      }
    }
    return result;
  });

  let flood: Set<string> | null = null;
  if (scn.flood !== undefined && scn.flood !== false) {
    const index = typeof scn.flood === 'number' ? scn.flood : 0;
    const r = scn.routes?.[index];
    if (r) flood = reachableFrom(pair(r.from), contextFor(scn, world2, wall, r.army));
  }
  const wadeable = (scn.rules?.wadeEnds ?? true) && (scn.rules?.palisade ?? true) ? wadeableWater(wall, tiles, world2) : new Set<string>();
  return { scenario: scn, pw: world2, wall, tiles, refused, routes, flood, wadeable };
}

// ---- the centrelines (the art contract's, drawn in the preview's flat-top geometry) ---------

const SQRT3 = Math.sqrt(3);
/** Offset to neighbour d in unit-circumradius space (y down); the same vectors the layers use. */
const DV: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
].map(([dq, dr]) => [1.5 * dq!, SQRT3 * (dr! + dq! / 2)] as const);

type Pt = readonly [number, number];
/** The midpoint of the edge facing neighbour `d` (unit circumradius, hex centre at the origin). */
export const edgeMidpoint = (d: number): Pt => [DV[d % 6]![0] / 2, DV[d % 6]![1] / 2];

function arc(centre: Pt, radius: number, from: Pt, to: Pt, steps = 18): Pt[] {
  const a0 = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
  const a1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    out.push([centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a)]);
  }
  return out;
}

/**
 * The wall's centreline through a hex, from the piece and the edges it runs into, in unit
 * circumradius space about the hex centre. docs/wall-tiles.md: a straight is a line edge to edge,
 * bend60 an arc of r 0.5 round the corner the two edges share, bend120 an arc of r 1.5 round the
 * far corner (the centre of the neighbour the wall skips), an end a line to 0.46 past the centre
 * (0.42 for the sea end).
 */
export function centreline(piece: PalisadePiece, edges: readonly number[]): Pt[] {
  const a = edges[0]!;
  const b = edges[1];
  switch (piece) {
    case 'straight180':
    case 'gate180':
      return [edgeMidpoint(a), [0, 0], edgeMidpoint(b!)];
    case 'bend60': {
      const c: Pt = [(DV[a]![0] + DV[b!]![0]) / 3, (DV[a]![1] + DV[b!]![1]) / 3];
      return arc(c, 0.5, edgeMidpoint(a), edgeMidpoint(b!));
    }
    case 'bend120': {
      const skipped = DV[(a + 1) % 6]!;
      return arc(skipped, 1.5, edgeMidpoint(a), edgeMidpoint(b!));
    }
    case 'end':
    case 'end_coast': {
      const reach = piece === 'end' ? 0.46 : 0.42;
      return [edgeMidpoint(a), [(-reach * DV[a]![0]) / SQRT3, (-reach * DV[a]![1]) / SQRT3]];
    }
  }
}

// ---- colours ----------------------------------------------------------------------------

const WALL_COLOUR: Rgb = [176, 118, 56];
const WALL_OUTLINE: Rgb = [30, 20, 10];
const GATE_COLOUR: Rgb = [255, 236, 150];
const SEA_END_COLOUR: Rgb = [214, 178, 120];
const FRIENDLY_COLOUR: Rgb = [60, 235, 95];
const ENEMY_COLOUR: Rgb = [245, 60, 60];
const REFUSED_COLOUR: Rgb = [255, 40, 200];
const MOUNTAIN_HATCH: Rgb = [58, 54, 50];
const WIDE_COLOUR: Rgb = [22, 58, 175];
const STREAM_COLOUR: Rgb = [130, 205, 245];
const WADE_COLOUR: Rgb = [90, 200, 190];
const FLOOD_TINT: Rgb = [255, 236, 120];
const FLOOD_AMOUNT = 0.3;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] * (1 - t) + b[0] * t),
  Math.round(a[1] * (1 - t) + b[1] * t),
  Math.round(a[2] * (1 - t) + b[2] * t),
];

const PIECE_LABEL: Record<PalisadePiece, string> = {
  straight180: 'STRAIGHT',
  bend60: 'BEND60',
  bend120: 'BEND120',
  gate180: 'GATE',
  end: 'END',
  end_coast: 'SEA END',
};

const LEGEND: readonly LegendEntry[] = [
  { label: 'sea', colour: TERRAIN_COLOURS.sea },
  { label: 'sand', colour: TERRAIN_COLOURS.sand },
  { label: 'grass', colour: TERRAIN_COLOURS.grass },
  { label: 'forest', colour: TERRAIN_COLOURS.forest },
  { label: 'bog', colour: BOG_COLOUR },
  { label: 'lake', colour: LAKE_COLOUR },
  { label: 'mountain (impassable, hatched)', colour: TERRAIN_COLOURS.mountain },
  { label: 'wide river (impassable)', colour: WIDE_COLOUR },
  { label: 'stream (crossable, +8)', colour: STREAM_COLOUR },
  { label: 'wadeable water at a land end (2.0)', colour: WADE_COLOUR },
  { label: 'palisade (impassable)', colour: WALL_COLOUR },
  { label: 'gate (friendly only)', colour: GATE_COLOUR },
  { label: 'friendly route', colour: FRIENDLY_COLOUR },
  { label: 'enemy route', colour: ENEMY_COLOUR },
  { label: 'refused placement', colour: REFUSED_COLOUR, shape: 'x' },
  { label: 'reachable (flood)', colour: mix(TERRAIN_COLOURS.grass, FLOOD_TINT, FLOOD_AMOUNT) },
];

// ---- the layer -------------------------------------------------------------------------

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const at = (c: AxialCoord | Refused) => `${c.q},${c.r}`;
/** `gateNotStraight` -> `GATE NOT STRAIGHT` (the bitmap font is upper case and has no camel case). */
const reasonText = (reason: PalisadeRefusal): string => reason.replace(/([A-Z])/g, ' $1').toUpperCase();

/** Greedy word wrap, so a long title does not run off the picture (the footer is drawn in one line per entry). */
export function wrap(text: string, width: number, indent = ''): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      out.push(line);
      line = indent + word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') out.push(line);
  return out;
}

export function footerLines(run: ScenarioRun): string[] {
  const { scenario: scn } = run;
  const lines = wrap(`SCENARIO ${scn.name}${scn.title ? `: ${scn.title}` : ''}`, 118, '    ');
  const rules = scn.rules ?? {};
  lines.push(
    `RULES  WIDE RIVERS ${(rules.wideRivers ?? true) ? 'IMPASSABLE' : 'CROSSABLE'}  MOUNTAINS ${(rules.mountains ?? true) ? 'IMPASSABLE' : 'COST 2.0'}  PALISADE ${(rules.palisade ?? true) ? 'BLOCKS (GATE: FRIENDLY ONLY)' : 'IGNORED'}`,
  );
  if (run.wall.walls.size > 0) {
    const counts = new Map<string, number>();
    for (const t of run.tiles.values()) {
      const k = isRefusal(t) ? reasonText(t.refusal) : PIECE_LABEL[t.piece];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    lines.push(`WALL ${run.wall.walls.size} HEXES  ${[...counts].map(([k, n]) => `${n} ${k}`).join('  ')}`);
  }
  for (const r of run.refused) lines.push(`REFUSED ${r.gate ? 'GATE' : 'WALL'} AT ${at(r)}: ${reasonText(r.reason)}`);
  for (const r of run.routes) {
    const head = `ROUTE ${r.label} ${r.route.army.toUpperCase()} ${r.route.from.join(',')} > ${r.route.to.join(',')}`;
    const was = r.before ? `OLD RULES ${r.before.length - 1} STEPS COST ${fmt(r.before.cost)}` : 'OLD RULES NO ROUTE';
    if (r.path && r.cost !== null) lines.push(`${head}: ${r.path.length - 1} STEPS  COST ${fmt(r.cost)}   (${was})`);
    else lines.push(`${head}: NO ROUTE${r.note ? ` (${r.note.toUpperCase()})` : ''}   (${was})`);
  }
  return lines;
}

/** A layer that draws the scenario's terrain, rivers, wall and routes; built per scenario (it holds the run). */
export function createPathingLayer(scn: Scenario): Layer {
  let run: ScenarioRun | null = null;
  const must = (): ScenarioRun => run ?? (run = runScenario(scn));

  return {
    id: 'pathing',
    description: 'terrain with the owner\'s movement rules, palisade pieces and the A* routes of a scenario',
    legend: LEGEND,
    subhex: true,
    prepare(world, window) {
      run = runScenario(scn, buildPathingWorld(world, window));
      return footerLines(run);
    },
    colourAt(q, r, _world, dx = 0, dy = 0, fine = false) {
      const { pw, flood, wadeable } = must();
      const c = { q, r };
      const terrain: Terrain = pw.terrainAt(c);
      let colour: Rgb = terrain === 'bog' ? BOG_COLOUR : terrain === 'lake' ? LAKE_COLOUR : TERRAIN_COLOURS[terrain];
      const tile: RiverTile | undefined = pw.riverAt(c);
      if (tile) {
        const rc = riverColourAt(tile, dx, dy, fine, false);
        // Off the flow the river hex keeps its land colour (the helper answers grass there).
        if (rc !== TERRAIN_COLOURS.grass) colour = rc;
      }
      if (wadeable.has(coordKey(c))) {
        // Light dotted teal: shallows a land army wades through.
        const dot = fine ? Math.hypot(((dx * 5) % 1 + 1) % 1 - 0.5, ((dy * 5) % 1 + 1) % 1 - 0.5) < 0.22 : true;
        colour = mix(colour, WADE_COLOUR, dot ? 0.75 : 0.25);
      }
      if (!fine) {
        if (terrain === 'mountain') colour = mix(colour, MOUNTAIN_HATCH, 0.4);
        return flood?.has(coordKey(c)) && terrain !== 'sea' ? mix(colour, FLOOD_TINT, FLOOD_AMOUNT) : colour;
      }
      if (terrain === 'mountain' && ((((dx + dy) * 4) % 1) + 1) % 1 < 0.3) colour = MOUNTAIN_HATCH;
      if (flood?.has(coordKey(c)) && terrain !== 'sea') colour = mix(colour, FLOOD_TINT, FLOOD_AMOUNT);
      // A faint hex grid so adjacency can be counted by eye.
      const edge = Math.max(Math.abs(dy), Math.abs(0.866 * dx + 0.5 * dy), Math.abs(0.866 * dx - 0.5 * dy));
      if (edge > 0.866 - 0.035) colour = mix(colour, [0, 0, 0], 0.22);
      return colour;
    },
    overlay(canvas) {
      drawRun(canvas, must());
    },
  };
}

function polyline(canvas: OverlayCanvas, pts: readonly { x: number; y: number }[], width: number, colour: Rgb): void {
  for (let i = 0; i + 1 < pts.length; i++) canvas.line(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y, width, colour);
}

function drawRun(canvas: OverlayCanvas, run: ScenarioRun): void {
  const s = canvas.scale;
  const wallWidth = Math.max(3, 0.22 * s);

  const place = (c: AxialCoord, p: Pt) => {
    const o = canvas.toPixel(c.q, c.r);
    return { x: o.x + p[0] * s, y: o.y + p[1] * s };
  };

  // Walls: outline first, so touching hexes read as one line.
  const drawn: { c: AxialCoord; tile: PalisadeTile }[] = [];
  for (const [key, tile] of run.tiles) if (!isRefusal(tile)) drawn.push({ c: parseKey(key), tile });
  for (const pass of [0, 1]) {
    for (const { c, tile } of drawn) {
      const pts = centreline(tile.piece, tile.edges).map((p) => place(c, p));
      if (tile.piece === 'end_coast') {
        // Stakes stepping down into the water: dashes, not a solid rampart.
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[i + 1]!;
          const n = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (0.14 * s)));
          for (let k = 0; k < n; k += 2) {
            const p0 = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
            const p1 = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
            canvas.line(p0.x, p0.y, p1.x, p1.y, wallWidth + (pass === 0 ? 2 : 0), pass === 0 ? WALL_OUTLINE : SEA_END_COLOUR);
          }
        }
        continue;
      }
      polyline(canvas, pts, wallWidth + (pass === 0 ? 2.5 : 0), pass === 0 ? WALL_OUTLINE : WALL_COLOUR);
    }
  }
  // Ends get a lookout (a square at the tip); a gate a bright crossing bar and two posts.
  for (const { c, tile } of drawn) {
    if (tile.piece === 'end') {
      const tip = centreline(tile.piece, tile.edges)[1]!;
      const p = place(c, tip);
      canvas.marker(p.x, p.y, 'square', 0.2 * s, [235, 205, 140]);
    } else if (tile.piece === 'gate180') {
      const [a, b] = tile.edges as [number, number];
      const ca = place(c, edgeMidpoint(a));
      const cb = place(c, edgeMidpoint(b));
      const dirx = (cb.x - ca.x) / Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const diry = (cb.y - ca.y) / Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const centre = place(c, [0, 0]);
      // Posts either side of the passage, and the opening between them in the gate colour.
      canvas.line(centre.x - dirx * 0.2 * s, centre.y - diry * 0.2 * s, centre.x + dirx * 0.2 * s, centre.y + diry * 0.2 * s, wallWidth * 0.6, GATE_COLOUR);
      for (const sign of [-1, 1]) {
        const px = centre.x + sign * dirx * 0.3 * s;
        const py = centre.y + sign * diry * 0.3 * s;
        canvas.marker(px, py, 'square', 0.12 * s, GATE_COLOUR);
      }
    }
  }

  if (run.scenario.labels) {
    for (const { c, tile } of drawn) {
      const o = canvas.toPixel(c.q, c.r);
      const text = `${PIECE_LABEL[tile.piece]} ${tile.dir}`;
      const w = text.length * 4 + 2;
      canvas.rect(o.x - w / 2, o.y + 0.38 * s, w, 8, [10, 10, 14]);
      canvas.text(o.x - w / 2 + 1, o.y + 0.38 * s + 1, text, [240, 240, 240], 1);
    }
  }

  // Routes: dark casing, then the colour, then the markers.
  for (const r of run.routes) {
    const colour = r.route.army === 'friendly' ? FRIENDLY_COLOUR : ENEMY_COLOUR;
    const from = canvas.toPixel(r.route.from[0], r.route.from[1]);
    const to = canvas.toPixel(r.route.to[0], r.route.to[1]);
    if (r.path) {
      const pts = r.path.map((c) => canvas.toPixel(c.q, c.r));
      polyline(canvas, pts, Math.max(2.5, 0.2 * s) + 2.5, [10, 10, 14]);
      polyline(canvas, pts, Math.max(2.5, 0.2 * s), colour);
    }
    canvas.marker(from.x, from.y, 'disc', 0.42 * s, colour);
    canvas.text(from.x - 2.5 * 2 + 1, from.y - 5, r.label, [10, 10, 14], 2);
    canvas.marker(to.x, to.y, 'diamond', 0.5 * s, colour);
    canvas.text(to.x - 2.5 * 2 + 1, to.y - 5, `${r.label}'`, [10, 10, 14], 2);
  }

  // NO ROUTE flags last, so no marker covers them; stacked upward when destinations are close.
  const flagged: { x: number; y: number }[] = [];
  for (const r of run.routes) {
    if (r.path) continue;
    const colour = r.route.army === 'friendly' ? FRIENDLY_COLOUR : ENEMY_COLOUR;
    const to = canvas.toPixel(r.route.to[0], r.route.to[1]);
    const text = 'NO ROUTE';
    const scale = 3;
    const w = text.length * 4 * scale + 8;
    const h = 5 * scale + 4;
    let y = to.y - 0.5 * s - h - 8;
    while (flagged.some((f) => Math.abs(f.x - to.x) < w && Math.abs(f.y - y) < h + 6)) y -= h + 6;
    flagged.push({ x: to.x, y });
    canvas.rect(to.x - w / 2 - 2, y - 2, w + 4, h + 4, [10, 10, 14]);
    canvas.rect(to.x - w / 2, y, w, h, colour);
    canvas.text(to.x - w / 2 + 4, y + 2, text, [255, 255, 255], scale);
  }

  // Refused placements: a magenta cross and the reason.
  for (const f of run.refused) {
    const o = canvas.toPixel(f.q, f.r);
    canvas.marker(o.x, o.y, 'x', 0.55 * s, REFUSED_COLOUR);
    const text = reasonText(f.reason);
    const w = text.length * 4 + 2;
    canvas.rect(o.x - w / 2, o.y - 0.5 * s - 11, w, 9, [10, 10, 14]);
    canvas.text(o.x - w / 2 + 1, o.y - 0.5 * s - 10, text, REFUSED_COLOUR, 1);
  }
}

// ---- running scenarios ---------------------------------------------------------------------

export function renderScenario(scn: Scenario): { png: Buffer; lines: string[]; run: ScenarioRun | null } {
  const layer = createPathingLayer(scn);
  const result = renderPreview({
    seed: scn.seed,
    radius: scn.radius,
    window: scn.window,
    hexPixels: scn.px ?? 22,
    layers: ['pathing'],
    layerObjects: [layer],
    legend: true,
    stats: false,
  });
  return { png: result.png, lines: result.statsLines, run: null };
}

const USAGE = `worldgen pathing preview

  npm run worldgen-pathing -- SCENARIO.json [--out FILE.png]
  npm run worldgen-pathing -- --all [--dir scripts/worldgen-preview/scenarios] [--out-dir DIR] [--prefix pathing-]

Renders each scenario (see scripts/worldgen-preview/README.md) and prints its footer lines.
`;

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(USAGE);
    return;
  }
  const base = process.env.INIT_CWD ?? process.cwd();
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  let files: string[];
  if (args.includes('--all')) {
    const dir = resolve(base, opt('--dir') ?? new URL('./scenarios', import.meta.url).pathname);
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f));
  } else {
    files = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--out').map((f) => resolve(base, f));
  }
  const outDir = resolve(base, opt('--out-dir') ?? '.');
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const scn = parseScenario(readFileSync(file, 'utf8'), basename(file));
    const out = opt('--out') && files.length === 1 ? resolve(base, opt('--out')!) : join(outDir, `${opt('--prefix') ?? 'pathing-'}${scn.name}.png`);
    const started = performance.now();
    const { png, lines } = renderScenario(scn);
    writeFileSync(out, png);
    console.log(lines.filter((l) => !l.startsWith('SEED') && !l.startsWith('MS')).join('\n'));
    console.log(`wrote ${out} (${((performance.now() - started) / 1000).toFixed(1)} s)\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();

// Checks an island's bogland and rivers against the art's map rules and the owner's requirements — the
// TypeScript twin of the backend's `Bjarnoy.Domain.World.BogRules` (which documents R1-R11). The
// generator builds every site on scratch state and drops it when it would break one, so a generated island
// reports zero everywhere; the tests and the worldgen preview count these.
import { coordKey, type AxialCoord } from '../hex/coords';
import { waterRun } from './bogGenerator';
import { TILE_ORIENTATIONS } from './types';
import type { BogTile, RiverTile, Terrain } from './types';

export interface BogRuleViolations {
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
  R6: number;
  R7: number;
  R8: number;
  R9: number;
  R10: number;
  R11: number;
}

export function noViolations(): BogRuleViolations {
  return { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0, R8: 0, R9: 0, R10: 0, R11: 0 };
}

export function addViolations(a: BogRuleViolations, b: BogRuleViolations): BogRuleViolations {
  const sum = noViolations();
  for (const k of Object.keys(sum) as (keyof BogRuleViolations)[]) sum[k] = a[k] + b[k];
  return sum;
}

export function totalViolations(v: BogRuleViolations): number {
  return Object.values(v).reduce((a, b) => a + b, 0);
}

/** How far from a pocket lake its bog ring (and the sand it turned to bog) reaches: `BogPocketRadius` plus the lake's own filled edge. */
const POCKET_RING_REACH = 6;

const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];
const nb = (c: AxialCoord, d: number): AxialCoord => ({ q: c.q + DQ[d]!, r: c.r + DR[d]! });
const dirIndex = (o: TileOrientation | null | undefined): number => (o ? TILE_ORIENTATIONS.indexOf(o) : -1);
type TileOrientation = (typeof TILE_ORIENTATIONS)[number];

function hexDist(a: AxialCoord, b: AxialCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(-a.q - a.r + b.q + b.r));
}

/** Counts how often each bog map rule is broken on one island. `baseTerrain` is the seed's own terrain (never bog or lake). */
export function checkBogRules(
  bog: readonly BogTile[],
  rivers: readonly RiverTile[],
  baseTerrain: (c: AxialCoord) => Terrain,
): BogRuleViolations {
  const byCoord = new Map<string, BogTile>();
  for (const t of bog) byCoord.set(coordKey(t), t);
  const riverByCoord = new Map<string, RiverTile>();
  for (const r of rivers) riverByCoord.set(coordKey(r), r);

  const isLake = (c: AxialCoord): boolean => byCoord.get(coordKey(c))?.kind === 'lake';
  const mask = (c: AxialCoord): number => {
    let m = 0;
    for (let d = 0; d < 6; d++) if (isLake(nb(c, d))) m |= 1 << d;
    return m;
  };

  const v = noViolations();

  // Lake components (edge-connected).
  const component = new Map<string, number>();
  const componentTiles: AxialCoord[][] = [];
  const lakes = bog.filter((t) => t.kind === 'lake').sort((a, b) => a.q - b.q || a.r - b.r);
  for (const t of lakes) {
    if (component.has(coordKey(t))) continue;
    const id = componentTiles.length;
    const tiles: AxialCoord[] = [];
    const stack: AxialCoord[] = [{ q: t.q, r: t.r }];
    component.set(coordKey(t), id);
    while (stack.length > 0) {
      const c = stack.pop()!;
      tiles.push(c);
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        if (isLake(n) && !component.has(coordKey(n))) {
          component.set(coordKey(n), id);
          stack.push(n);
        }
      }
    }
    componentTiles.push(tiles);
  }

  const pocketLake = (id: number): boolean => componentTiles[id]!.some((c) => baseTerrain(c) === 'sea');

  // An enclosed pocket's ring may touch sand (the pocket is inside the island); everything else may not. A hex counts as
  // a pocket ring when it lies within the ring's reach of a pocket lake.
  const pocketTiles = componentTiles.flatMap((tiles, id) => (pocketLake(id) ? tiles : []));
  const inPocketRing = (c: AxialCoord): boolean => pocketTiles.some((p) => hexDist(p, c) <= POCKET_RING_REACH);

  for (const t of bog) {
    const c = { q: t.q, r: t.r };
    if (t.kind === 'lake') {
      // Every neighbour of a lake tile is lake or bog (R1); pocket lake tiles on sea have R10 for the same test.
      for (let d = 0; d < 6; d++) {
        if (!byCoord.has(coordKey(nb(c, d)))) {
          if (baseTerrain(c) === 'sea') v.R10++;
          else v.R1++;
        }
      }
      continue;
    }

    const m = mask(c);
    let count = 0;
    let runs = 0;
    for (let d = 0; d < 6; d++) {
      if (((m >> d) & 1) === 1) {
        count++;
        if (((m >> ((d + 5) % 6)) & 1) === 0) runs++;
      }
    }

    if (count > 3 || runs > 1) v.R1++;

    const touching = new Set<number>();
    for (let d = 0; d < 6; d++) if (((m >> d) & 1) === 1) touching.add(component.get(coordKey(nb(c, d)))!);
    if (touching.size > 1) v.R2++;

    // Kind must match what the tile touches.
    const expectedEdges = waterRun(m);
    const kindOk =
      t.kind === 'bog' || t.kind === 'creekspring' || t.kind === 'creek'
        ? count === 0
        : t.kind === 'inlet' || t.kind === 'mouth'
          ? count === 1
          : t.kind === 'shore'
            ? count === 2
            : t.kind === 'half'
              ? count === 3
              : false;
    if (!kindOk) v.R1++;

    if (
      (t.kind === 'inlet' || t.kind === 'shore' || t.kind === 'half' || t.kind === 'mouth') &&
      t.waterEdges.map(dirIndex).join(',') !== expectedEdges.join(',')
    ) {
      v.R1++;
    }

    // R7: never beside the open sea or sand.
    for (let d = 0; d < 6; d++) {
      const n = nb(c, d);
      if (byCoord.has(coordKey(n))) continue;
      const terrain = baseTerrain(n);
      if (terrain === 'sea' || (terrain === 'sand' && !inPocketRing(c))) v.R7++;
    }

    // Creek family: flow links, shapes, lake contact.
    if (t.kind === 'creek' || t.kind === 'mouth' || t.kind === 'creekspring') {
      const ins = t.inDirections.map(dirIndex);
      const outDir = dirIndex(t.outDirection);
      if (t.kind === 'creek') {
        if (ins.length !== 1 || outDir < 0) {
          v.R3++;
        } else {
          const opposite = (ins[0]! + 3) % 6;
          const turn = Math.min((outDir - opposite + 6) % 6, (opposite - outDir + 6) % 6);
          if (turn > 1) v.R3++;
        }
        if (count !== 0) v.R4++;
      } else if (t.kind === 'creekspring') {
        if (ins.length !== 0 || outDir < 0) v.R3++;
      } else {
        // Mouth: one water edge, the creek on the opposite edge, straight through.
        const water = t.waterEdges.length === 1 ? dirIndex(t.waterEdges[0]) : -1;
        const okShape =
          water >= 0 &&
          ins.length === 1 &&
          outDir >= 0 &&
          ((ins[0] === (water + 3) % 6 && outDir === water) || (ins[0] === water && outDir === (water + 3) % 6));
        if (!okShape || count !== 1) v.R4++;
      }

      // Every flow link is matched by the neighbour it points at (a creek tile, a river, or the lake for a mouth).
      const linkOk = (dir: number, expectFlowTowardUs: boolean): boolean => {
        const n = nb(c, dir);
        const back = (dir + 3) % 6;
        if (isLake(n)) return t.kind === 'mouth' && t.waterEdges.length === 1 && dirIndex(t.waterEdges[0]) === dir;

        const neighbour = byCoord.get(coordKey(n));
        if (neighbour) {
          if (neighbour.kind !== 'creek' && neighbour.kind !== 'mouth' && neighbour.kind !== 'creekspring') return false;
          return expectFlowTowardUs
            ? dirIndex(neighbour.outDirection) === back
            : neighbour.inDirections.some((x) => dirIndex(x) === back);
        }

        const river = riverByCoord.get(coordKey(n));
        if (river) {
          // R11: a creek meets a river at river width only.
          if ((river.width ?? 'river') === 'stream') v.R11++;
          return expectFlowTowardUs
            ? dirIndex(river.outDirection) === back
            : river.inDirections.some((x) => dirIndex(x) === back);
        }

        return false;
      };

      for (const d of ins) if (!linkOk(d, true)) v.R3++;
      if (outDir >= 0 && !linkOk(outDir, false)) v.R3++;
    }
  }

  // R8 / R9 / R10 per lake.
  for (let id = 0; id < componentTiles.length; id++) {
    const lakeSet = new Set(componentTiles[id]!.map((c) => coordKey(c)));
    const mouths = bog.filter((t) => t.kind === 'mouth' && [0, 1, 2, 3, 4, 5].some((d) => lakeSet.has(coordKey(nb(t, d)))));
    const outflow = mouths.filter(
      (m) => m.waterEdges.length === 1 && m.inDirections.length === 1 && m.inDirections[0] === m.waterEdges[0],
    ).length;
    const inflow = mouths.length - outflow;
    if (pocketLake(id)) {
      if (outflow !== 0) v.R8++;
    } else if (outflow !== 1 || inflow < 1) {
      v.R8++;
    }
  }

  for (const t of bog.filter((x) => x.kind === 'creekspring')) {
    if (componentTiles.some((l) => l.some((c) => hexDist(c, t) < 3))) v.R9++;

    // Follow the creek down: it must end in a river.
    let cur: BogTile | undefined = t;
    let steps = 0;
    let reachedRiver = false;
    while (steps++ < 200 && cur && cur.outDirection) {
      const n = nb(cur, dirIndex(cur.outDirection));
      if (riverByCoord.has(coordKey(n))) {
        reachedRiver = true;
        break;
      }
      cur = byCoord.get(coordKey(n));
      if (!cur || cur.kind === 'lake') break;
    }
    if (!reachedRiver) v.R9++;
  }

  return v;
}

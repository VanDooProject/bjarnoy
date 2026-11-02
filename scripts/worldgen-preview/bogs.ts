// Bog helpers of the worldgen preview: where the water of a bog tile ends up, and the per-island
// numbers the `bog` layer's footer and `bog-stats.ts` print. The bogland itself comes from the real
// generator (src/frontend/src/lib/map/bogGenerator.ts, the byte-identical twin of the backend's
// BogGenerator), called inside `generateRiversWithBogs`.
import { coordKey } from '../../src/frontend/src/lib/hex/coords';
import { TILE_ORIENTATIONS, type BogTile } from '../../src/frontend/src/lib/map/types';

const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];

const step = (t: { q: number; r: number }, dir: number) => ({ q: t.q + DQ[dir]!, r: t.r + DR[dir]! });
const dirIndex = (d: (typeof TILE_ORIENTATIONS)[number]) => TILE_ORIENTATIONS.indexOf(d);

/**
 * Where the water of every creek, mouth and spring tile of one island ends up: the key of the first
 * tile that is not bog (a river tile the creek feeds), or `null` when it ends in a lake without an
 * outflow (a river sunk into an enclosed pocket). Water that reaches a lake leaves by the lake's outflow mouth.
 */
export function bogWaterExits(bog: readonly BogTile[]): Map<string, string | null> {
  const byCoord = new Map(bog.map((t) => [coordKey(t), t]));
  const isLake = (k: string) => byCoord.get(k)?.kind === 'lake';

  // Outflow mouth of each lake component: any lake tile key -> the mouth, found by flood filling the lake.
  const outflowOf = new Map<string, BogTile | null>();
  for (const t of bog) {
    if (t.kind !== 'lake' || outflowOf.has(coordKey(t))) continue;
    const members: string[] = [coordKey(t)];
    const seen = new Set(members);
    for (let head = 0; head < members.length; head++) {
      const [q, r] = members[head]!.split(',').map(Number) as [number, number];
      for (let d = 0; d < 6; d++) {
        const nk = coordKey(step({ q, r }, d));
        if (isLake(nk) && !seen.has(nk)) {
          seen.add(nk);
          members.push(nk);
        }
      }
    }
    let outflow: BogTile | null = null;
    for (const m of bog) {
      if (m.kind !== 'mouth' || m.waterEdges.length !== 1 || m.inDirections.length !== 1) continue;
      if (m.inDirections[0] !== m.waterEdges[0]) continue;
      if (seen.has(coordKey(step(m, dirIndex(m.waterEdges[0]!))))) outflow = m;
    }
    for (const k of seen) outflowOf.set(k, outflow);
  }

  const exits = new Map<string, string | null>();
  for (const start of bog) {
    if (start.kind !== 'creek' && start.kind !== 'mouth' && start.kind !== 'creekspring') continue;
    let cur: BogTile | null = start;
    let result: string | null = null;
    for (let guard = 0; guard < 1000 && cur; guard++) {
      if (!cur.outDirection) break;
      const next = step(cur, dirIndex(cur.outDirection));
      const nk = coordKey(next);
      if (isLake(nk)) {
        const outflow = outflowOf.get(nk) ?? null;
        if (!outflow) {
          result = null;
          cur = null;
          break;
        }
        const after = step(outflow, dirIndex(outflow.outDirection!));
        const ak = coordKey(after);
        const tile = byCoord.get(ak);
        if (!tile) {
          result = ak;
          cur = null;
          break;
        }
        cur = tile;
        continue;
      }
      const tile = byCoord.get(nk);
      if (!tile) {
        result = nk;
        cur = null;
        break;
      }
      cur = tile;
    }
    exits.set(coordKey(start), result);
  }
  return exits;
}

/** Sizes of the lakes (edge-connected lake tiles) among `bog`, one entry per lake. */
export function lakeSizes(bog: readonly BogTile[]): number[] {
  const isLake = new Set(bog.filter((t) => t.kind === 'lake').map((t) => coordKey(t)));
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const k of [...isLake].sort()) {
    if (seen.has(k)) continue;
    let size = 0;
    const stack = [k];
    seen.add(k);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      size++;
      const [q, r] = cur.split(',').map(Number) as [number, number];
      for (let d = 0; d < 6; d++) {
        const nk = coordKey(step({ q, r }, d));
        if (isLake.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

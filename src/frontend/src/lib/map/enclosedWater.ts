// Enclosed water: sea an island encloses, not connected to the open sea (the inside of an O-shaped island).
// Mirrors `Bjarnoy.Domain.World.EnclosedWater`; shared by the bog generator (a pocket becomes a lake with a bog
// ring, or an inland lake) and the camp placement (no whale road in it). Keep the scan and DFS orders identical
// to the C#: the pocket builder uses the first water hex of a component.
import type { AxialCoord } from '../hex/coords';

const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];
const nb = (c: AxialCoord, d: number): AxialCoord => ({ q: c.q + DQ[d]!, r: c.r + DR[d]! });

/** The enclosed pockets of an island: groups of water hexes not connected to the open sea and with no land hex in them. */
export function enclosedWaterPockets(
  islandTiles: readonly AxialCoord[],
  isLand: (c: AxialCoord) => boolean,
): AxialCoord[][] {
  if (islandTiles.length === 0) return [];

  let minQ = Number.MAX_SAFE_INTEGER;
  let maxQ = -Number.MAX_SAFE_INTEGER;
  let minR = Number.MAX_SAFE_INTEGER;
  let maxR = -Number.MAX_SAFE_INTEGER;
  for (const t of islandTiles) {
    minQ = Math.min(minQ, t.q);
    maxQ = Math.max(maxQ, t.q);
    minR = Math.min(minR, t.r);
    maxR = Math.max(maxR, t.r);
  }
  minQ--;
  maxQ++;
  minR--;
  maxR++;
  const w = maxQ - minQ + 1;
  const h = maxR - minR + 1;
  const state = new Uint8Array(w * h); // 0 water not yet seen, 1 island land, 2 open sea
  for (const t of islandTiles) state[(t.r - minR) * w + (t.q - minQ)] = 1;

  const queue: number[] = [];
  for (let q = 0; q < w; q++) {
    for (const r of [0, h - 1]) {
      const idx = r * w + q;
      if (state[idx] === 0) {
        state[idx] = 2;
        queue.push(idx);
      }
    }
  }
  for (let r = 0; r < h; r++) {
    for (const q of [0, w - 1]) {
      const idx = r * w + q;
      if (state[idx] === 0) {
        state[idx] = 2;
        queue.push(idx);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head]!;
    const q = (idx % w) + minQ;
    const r = Math.floor(idx / w) + minR;
    for (let d = 0; d < 6; d++) {
      const n = nb({ q, r }, d);
      const nq = n.q - minQ;
      const nr = n.r - minR;
      if (nq < 0 || nr < 0 || nq >= w || nr >= h) continue;
      const ni = nr * w + nq;
      if (state[ni] === 0) {
        state[ni] = 2;
        queue.push(ni);
      }
    }
  }

  // Remaining water cells are enclosed: group them.
  const seen = new Set<number>();
  const components: AxialCoord[][] = [];
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      const idx = r * w + q;
      if (state[idx] !== 0 || seen.has(idx)) continue;
      seen.add(idx);
      const comp: AxialCoord[] = [];
      const pending: number[] = [idx];
      while (pending.length > 0) {
        const cur = pending.pop()!;
        const c = { q: (cur % w) + minQ, r: Math.floor(cur / w) + minR };
        comp.push(c);
        for (let d = 0; d < 6; d++) {
          const n = nb(c, d);
          const nq = n.q - minQ;
          const nr = n.r - minR;
          if (nq < 0 || nr < 0 || nq >= w || nr >= h) continue;
          const ni = nr * w + nq;
          if (state[ni] === 0 && !seen.has(ni)) {
            seen.add(ni);
            pending.push(ni);
          }
        }
      }
      components.push(comp);
    }
  }

  // Nothing but sea-level water may be in the pocket: another landmass inside it means it is not ours.
  return components.filter((c) => !c.some((t) => isLand(t)));
}

/** Every hex of every enclosed pocket, sorted by (q, r). */
export function enclosedWaterTiles(
  islandTiles: readonly AxialCoord[],
  isLand: (c: AxialCoord) => boolean,
): AxialCoord[] {
  const tiles = enclosedWaterPockets(islandTiles, isLand).flat();
  tiles.sort((a, b) => a.q - b.q || a.r - b.r);
  return tiles;
}

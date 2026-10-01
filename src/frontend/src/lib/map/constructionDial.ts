/**
 * Construction progress dial: pure helpers for the hex-shaped dial drawn over
 * a building under construction (see `HexMapRenderer.drawHighlight`). Kept
 * free of Pixi so the mapping and geometry are unit-testable.
 */
import type { BuildOrderResponse } from '../../api/types';
import type { AxialCoord } from '../hex/coords';

export interface ConstructionDial {
  coord: AxialCoord;
  /** `Date.now()`-epoch ms the build started; null while waiting / unknown. */
  startMs: number | null;
  /** `Date.now()`-epoch ms the build completes; null while waiting / unknown. */
  endMs: number | null;
}

/**
 * One dial per hex from the HUD build queue. `fetchedAt` is the `Date.now()`
 * at which `completesInSeconds` was measured. A 'building' order wins over a
 * 'waiting' one sharing the same hex.
 */
export function constructionDialsFromQueue(queue: BuildOrderResponse[], fetchedAt: number): ConstructionDial[] {
  const byHex = new Map<string, { dial: ConstructionDial; building: boolean }>();
  for (const o of queue) {
    const building = o.state === 'building';
    let startMs: number | null = null;
    let endMs: number | null = null;
    if (building && o.completesInSeconds !== null && o.totalSeconds > 0) {
      endMs = fetchedAt + o.completesInSeconds * 1000;
      startMs = endMs - o.totalSeconds * 1000;
    }
    const key = `${o.q},${o.r}`;
    const existing = byHex.get(key);
    if (existing && (existing.building || !building)) continue;
    byHex.set(key, { dial: { coord: { q: o.q, r: o.r }, startMs, endMs }, building });
  }
  return [...byHex.values()].map((e) => e.dial);
}

/** Elapsed fraction 0..1 of the build at `nowMs`; 0 when timing is unknown. */
export function dialProgress(d: ConstructionDial, nowMs: number): number {
  if (d.startMs === null || d.endMs === null || d.endMs <= d.startMs) return 0;
  return Math.min(1, Math.max(0, (nowMs - d.startMs) / (d.endMs - d.startMs)));
}

/**
 * Flat [x, y, ...] polyline along a pointy-top hexagon's perimeter (vertex i
 * at -90 + 60i degrees, matching `hexPoints`), from the top vertex clockwise
 * for `fraction` (clamped 0..1) of the perimeter.
 */
export function hexPerimeterPath(cx: number, cy: number, r: number, fraction: number): number[] {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) return [];
  const vertex = (i: number): [number, number] => {
    const a = (Math.PI / 180) * (-90 + 60 * i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const edges = f * 6;
  const full = Math.min(6, Math.floor(edges));
  const out: number[] = [];
  for (let i = 0; i <= full; i++) out.push(...vertex(i % 6));
  const partial = edges - full;
  if (full < 6 && partial > 1e-9) {
    const [x0, y0] = vertex(full);
    const [x1, y1] = vertex((full + 1) % 6);
    out.push(x0 + (x1 - x0) * partial, y0 + (y1 - y0) * partial);
  }
  return out;
}

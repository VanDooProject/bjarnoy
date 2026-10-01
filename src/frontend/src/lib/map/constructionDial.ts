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

/** Seconds left at `nowMs`; null when timing is unknown (waiting order). */
export function dialRemainingSeconds(d: ConstructionDial, nowMs: number): number | null {
  if (d.startMs === null || d.endMs === null) return null;
  return Math.max(0, (d.endMs - nowMs) / 1000);
}

/**
 * Flat [x, y, ...] polyline along a closed polygon's perimeter, from
 * `vertices[0]` in array order, covering `fraction` (clamped 0..1) of the
 * total perimeter LENGTH (edges may differ in length).
 */
export function polygonPerimeterPath(vertices: { x: number; y: number }[], fraction: number): number[] {
  const f = Math.min(1, Math.max(0, fraction));
  const n = vertices.length;
  if (f <= 0 || n < 2) return [];
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  if (total <= 0) return [];
  let remaining = f * total;
  const out: number[] = [vertices[0].x, vertices[0].y];
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (remaining >= lens[i] - 1e-9) {
      out.push(b.x, b.y);
      remaining -= lens[i];
      if (remaining <= 1e-9) break;
    } else {
      const t = remaining / lens[i];
      out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      break;
    }
  }
  return out;
}

/**
 * Flat [x, y, ...] polyline along a pointy-top hexagon's perimeter (vertex i
 * at -90 + 60i degrees, matching `hexPoints`), from the top vertex clockwise
 * for `fraction` (clamped 0..1) of the perimeter.
 */
export function hexPerimeterPath(cx: number, cy: number, r: number, fraction: number): number[] {
  const vertices = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + 60 * i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return polygonPerimeterPath(vertices, fraction);
}

export type ConstructionDialStyle = 'outline' | 'bold' | 'pie' | 'tile';

/** Live-tweakable dial look (exposed as `window.__dialTuning` in demo mode). */
export const constructionDialTuning: { style: ConstructionDialStyle } = { style: 'outline' };

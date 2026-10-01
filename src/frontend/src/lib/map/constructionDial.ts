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

/**
 * Flat [x, y, ...] open polyline through `points`, covering `fraction`
 * (clamped 0..1) of its total LENGTH.
 */
export function polylinePartial(points: { x: number; y: number }[], fraction: number): number[] {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0 || points.length < 2) return [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  if (total <= 0) return [];
  let remaining = f * total;
  const out: number[] = [points[0].x, points[0].y];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining >= l - 1e-9) {
      out.push(b.x, b.y);
      remaining -= l;
      if (remaining <= 1e-9) break;
    } else {
      const t = remaining / l;
      out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      break;
    }
  }
  return out;
}

/** How long the completion animation plays after a build ends. */
export const DIAL_FINISH_MS = 2600;

export interface DialFinishFrame {
  /** Dial size multiplier (pop). */
  scale: number;
  /** Yellow fill overlay strength 0..1. */
  flash: number;
  /** Expanding hex shockwaves. */
  rings: { scale: number; alpha: number }[];
  /** Check-mark draw progress 0..1. */
  check: number;
  /** Whole-dial opacity 0..1. */
  alpha: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** Completion animation state `msSinceEnd` after the build ended; null outside it. */
export function dialFinishFrame(msSinceEnd: number): DialFinishFrame | null {
  if (msSinceEnd < 0 || msSinceEnd >= DIAL_FINISH_MS) return null;
  const t = msSinceEnd;
  let scale = 1;
  if (t < 180) scale = 1 + 0.22 * easeOut(t / 180);
  else if (t < 480) scale = 1.22 - 0.22 * easeInOut((t - 180) / 300);
  const rings = [0, 160].map((start) => {
    const p = clamp01((t - start) / 700);
    return t < start || p >= 1 ? { scale: 1, alpha: 0 } : { scale: 1 + 1.1 * easeOut(p), alpha: 0.9 * (1 - p) };
  });
  return {
    scale,
    flash: clamp01(1 - t / 400),
    rings,
    check: clamp01((t - 200) / 320),
    alpha: t <= 1900 ? 1 : clamp01(1 - (t - 1900) / (DIAL_FINISH_MS - 1900)),
  };
}

/**
 * Carry dials that just completed server-side (and so vanished from `next`)
 * over so their finish animation can play. Cancelled orders (end far in the
 * future / unknown) and expired animations are dropped.
 */
export function retainFinishingDials(prev: ConstructionDial[], next: ConstructionDial[], nowMs: number): ConstructionDial[] {
  const out = [...next];
  for (const d of prev) {
    if (d.endMs === null || d.endMs > nowMs + 5000) continue;
    if (next.some((n) => n.coord.q === d.coord.q && n.coord.r === d.coord.r)) continue;
    const endMs = Math.min(d.endMs, nowMs);
    if (nowMs - endMs >= DIAL_FINISH_MS) continue;
    out.push({ ...d, endMs });
  }
  return out;
}

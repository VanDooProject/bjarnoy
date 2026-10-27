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
  /**
   * `Date.now()`-epoch ms the server refused the build this (still "…") dial
   * stood for: the dial plays `dialRejectFrame` from then and is pruned.
   */
  rejectedAtMs?: number;
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

/** The dial label's font size in px at map scale 1 (`LABEL_STYLES.dialTime` is 12 px, drawn at 1.2x). */
export const DIAL_LABEL_BASE_PX = 12 * 1.2;
/** A dial's time label is hidden while it would be smaller than this many on-screen px. */
export const DIAL_MIN_LABEL_PX = 10;
/** How long a dial takes to grow to / shrink back from its hovered size. */
export const DIAL_HOVER_MS = 150;

export interface DialScale {
  /** Multiplier for the dial's radius, strokes and label (1 = the size at the settlement's default zoom). */
  zs: number;
  /** Whether the time label is drawn. */
  showLabel: boolean;
}

/**
 * Dial sizing. `mapScale` is `camera.zoom / SETTLEMENT_DEFAULT_ZOOM`: the dial
 * scales exactly with the map (no floor, so it stays the same fraction of a
 * tile at every zoom). The time label is dropped once it would be below
 * `DIAL_MIN_LABEL_PX` on screen. `hoverT` (0..1, the linear tween progress)
 * lifts the dial to at least its default-zoom size (`max(mapScale, 1)`, so a
 * dial already bigger than that never shrinks) and, from halfway, forces the
 * label. `rejectScale` is the rejection animation's shrink.
 */
export function dialScale(mapScale: number, hoverT: number, rejectScale = 1): DialScale {
  const t = clamp01(hoverT);
  const eased = easeInOut(t);
  const zs = mapScale + (Math.max(mapScale, 1) - mapScale) * eased;
  return { zs, showLabel: t >= 0.5 || DIAL_LABEL_BASE_PX * zs * rejectScale >= DIAL_MIN_LABEL_PX };
}

/**
 * One tween step of a dial's hover progress: toward 1 while `hovered`, toward
 * 0 otherwise, taking `DIAL_HOVER_MS` for the full range. With reduced motion
 * it jumps straight to the target.
 */
export function dialHoverStep(t: number, hovered: boolean, dtMs: number, reducedMotion: boolean): number {
  const target = hovered ? 1 : 0;
  if (reducedMotion) return target;
  const step = Math.max(0, dtMs) / DIAL_HOVER_MS;
  return target > t ? Math.min(target, t + step) : Math.max(target, t - step);
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

/** How long the rejection animation (shake, then fade out) plays. */
export const DIAL_REJECT_MS = 480;
const REJECT_SHAKE_MS = 280;

export interface DialRejectFrame {
  /** Horizontal shake offset in px. */
  offsetX: number;
  /** Dial size multiplier (shrinks to .6 while fading). */
  scale: number;
  /** Whole-dial opacity 0..1. */
  alpha: number;
}

const REJECT_SHAKE_OFFSETS = [0, -4, 4, -2, 0];

/**
 * Rejection animation state `msSinceReject` after the server refused the
 * build: a +-4 px shake over 280 ms, then fade and shrink to .6 over 200 ms;
 * null outside it.
 */
export function dialRejectFrame(msSinceReject: number): DialRejectFrame | null {
  if (msSinceReject < 0 || msSinceReject >= DIAL_REJECT_MS) return null;
  if (msSinceReject < REJECT_SHAKE_MS) {
    // Five evenly spaced keyframes (0, -4, 4, -2, 0), linearly interpolated.
    const pos = (msSinceReject / REJECT_SHAKE_MS) * (REJECT_SHAKE_OFFSETS.length - 1);
    const i = Math.min(REJECT_SHAKE_OFFSETS.length - 2, Math.floor(pos));
    const offsetX = REJECT_SHAKE_OFFSETS[i] + (REJECT_SHAKE_OFFSETS[i + 1] - REJECT_SHAKE_OFFSETS[i]) * (pos - i);
    return { offsetX, scale: 1, alpha: 1 };
  }
  const p = clamp01((msSinceReject - REJECT_SHAKE_MS) / (DIAL_REJECT_MS - REJECT_SHAKE_MS));
  return { offsetX: 0, scale: 1 - 0.4 * p, alpha: 1 - p };
}

/**
 * Carry dials that just completed server-side (and so vanished from `next`)
 * over so their finish animation can play. Cancelled orders (end far in the
 * future / unknown) and expired animations are dropped. A dial that is playing
 * its rejection (`rejectedAtMs`) is carried over until that has played.
 */
export function retainFinishingDials(prev: ConstructionDial[], next: ConstructionDial[], nowMs: number): ConstructionDial[] {
  const out = [...next];
  for (const d of prev) {
    // A refused build's dial outlives its (removed) pending order while it plays its rejection.
    if (d.rejectedAtMs !== undefined) {
      if (nowMs - d.rejectedAtMs < DIAL_REJECT_MS && !next.some((n) => n.coord.q === d.coord.q && n.coord.r === d.coord.r)) out.push(d);
      continue;
    }
    if (d.endMs === null || d.endMs > nowMs + 5000) continue;
    if (next.some((n) => n.coord.q === d.coord.q && n.coord.r === d.coord.r)) continue;
    const endMs = Math.min(d.endMs, nowMs);
    if (nowMs - endMs >= DIAL_FINISH_MS) continue;
    out.push({ ...d, endMs });
  }
  return out;
}

/**
 * Construction progress dial: pure helpers for the hex-shaped dial drawn over
 * a building under construction (see `HexMapRenderer.drawHighlight`). Kept
 * free of Pixi so the mapping and geometry are unit-testable.
 */
import type { BuildOrderResponse } from '../../api/types';
import type { AxialCoord } from '../hex/coords';
import { isPendingOrder } from '../hud/pendingBuild';

/** The elapsed arc, the sweep and the finish animation. */
export const CONSTRUCTION_DIAL_ELAPSED_COLOR = 0xffd23f;
/** The refused-build dial: red outline, flash and rings. */
export const CONSTRUCTION_DIAL_REJECT_COLOR = 0xff4d3d;

export interface ConstructionDial {
  coord: AxialCoord;
  /** `Date.now()`-epoch ms the build started; null while queued / pending / unknown. */
  startMs: number | null;
  /** `Date.now()`-epoch ms the build completes; null while queued / pending / unknown. */
  endMs: number | null;
  /**
   * `building`: a running build (progress arc + countdown). `queued`: a real server `waiting` order behind full
   * construction slots (plain track + `#position`). `pending`: a client-only order the server has not answered yet
   * (sweep + dots).
   */
  state: 'building' | 'queued' | 'pending';
  /** 1-based place among the queued (non-pending) orders in queue order; null unless `state` is `queued`. */
  queuePosition: number | null;
  /**
   * `Date.now()`-epoch ms the server refused the build this pending dial
   * stood for: the dial plays `dialRejectFrame` from then and is pruned.
   */
  rejectedAtMs?: number;
}

/**
 * One dial per hex from the HUD build queue. `fetchedAt` is the `Date.now()`
 * at which `completesInSeconds` was measured. A 'building' order wins over a
 * 'waiting' one sharing the same hex. A client pending order is `pending`, any
 * other 'waiting' order is `queued` with its 1-based place among the real
 * waiting orders (the queue array's order is taken as the promotion order; the
 * next refresh corrects it).
 */
export function constructionDialsFromQueue(queue: BuildOrderResponse[], fetchedAt: number): ConstructionDial[] {
  const byHex = new Map<string, { dial: ConstructionDial; building: boolean }>();
  let queuedSoFar = 0;
  for (const o of queue) {
    const building = o.state === 'building';
    const pending = !building && isPendingOrder(o);
    let state: ConstructionDial['state'] = 'building';
    let queuePosition: number | null = null;
    if (pending) state = 'pending';
    else if (!building) {
      state = 'queued';
      queuedSoFar += 1;
      queuePosition = queuedSoFar;
    }
    let startMs: number | null = null;
    let endMs: number | null = null;
    if (building && o.completesInSeconds !== null && o.totalSeconds > 0) {
      endMs = fetchedAt + o.completesInSeconds * 1000;
      startMs = endMs - o.totalSeconds * 1000;
    }
    const key = `${o.q},${o.r}`;
    const existing = byHex.get(key);
    if (existing && (existing.building || !building)) continue;
    byHex.set(key, { dial: { coord: { q: o.q, r: o.r }, startMs, endMs, state, queuePosition }, building });
  }
  return [...byHex.values()].map((e) => e.dial);
}

/**
 * The dials the canvas still draws while the building HUD owns some: `hudOwned` holds the hexes (`q,r`) that have a HUD marker
 * (a standing building, no wall); the marker's dial draws every state of an order there (running, queued, pending, refused,
 * finishing, raze), so the canvas skips all of them. New builds (no marker yet) always draw. `null` = building info is off:
 * every dial draws.
 */
export function skipHudOwnedDials(dials: ConstructionDial[], hudOwned: ReadonlySet<string> | null): ConstructionDial[] {
  if (!hudOwned || hudOwned.size === 0) return dials;
  return dials.filter((d) => !hudOwned.has(`${d.coord.q},${d.coord.r}`));
}

/** Elapsed fraction 0..1 of the build at `nowMs`; 0 when timing is unknown. */
export function dialProgress(d: ConstructionDial, nowMs: number): number {
  if (d.startMs === null || d.endMs === null || d.endMs <= d.startMs) return 0;
  return Math.min(1, Math.max(0, (nowMs - d.startMs) / (d.endMs - d.startMs)));
}

/** Seconds left at `nowMs`; null when timing is unknown (queued / pending order). */
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
 * Flat [x, y, ...] polyline along the hexagon's perimeter (same layout as `hexPerimeterPath`) from perimeter fraction
 * `from` to `to`. `to` may exceed 1: the segment wraps past the top vertex. A span of 1 or more covers the full loop.
 */
export function hexPerimeterSegment(cx: number, cy: number, r: number, from: number, to: number): number[] {
  const vertices = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + 60 * i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const span = to - from;
  if (span <= 0) return [];
  if (span >= 1) return hexPerimeterPath(cx, cy, r, 1);
  const start = ((from % 1) + 1) % 1;
  const end = start + span;
  // Hex edges are equal length, so fraction k/6 is vertex k.
  const pointAt = (f: number) => {
    const t = (((f % 1) + 1) % 1) * 6;
    const i = Math.min(5, Math.floor(t));
    const a = vertices[i];
    const b = vertices[(i + 1) % 6];
    const u = t - i;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const out: number[] = [];
  const first = pointAt(start);
  out.push(first.x, first.y);
  for (let k = Math.floor(start * 6) + 1; k / 6 < end - 1e-9; k++) {
    const v = vertices[k % 6];
    out.push(v.x, v.y);
  }
  const last = pointAt(end);
  out.push(last.x, last.y);
  return out;
}

/** Pending dial: one orbit of the perimeter sweep, in ms. */
export const DIAL_PENDING_SWEEP_MS = 1100;
/** Pending dial: one bounce cycle of the centre dots, in ms. */
export const DIAL_PENDING_DOT_MS = 700;

/**
 * One centre dot of the pending dial at `nowMs`: `lift` is the upward offset in dot radii, `alpha` the opacity factor.
 * With reduced motion the dots stand still at full opacity.
 */
export function pendingDotFrame(nowMs: number, index: number, reducedMotion: boolean): { lift: number; alpha: number } {
  if (reducedMotion) return { lift: 0, alpha: 1 };
  const ph = Math.max(0, Math.sin(2 * Math.PI * (nowMs / DIAL_PENDING_DOT_MS - index * 0.18)));
  return { lift: ph * 1.4, alpha: 0.5 + 0.5 * ph };
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

/** Dial hex radius in px at zoom factor `zs` (and reject shrink `rejectScale`). */
export function dialRadiusPx(zs: number, rejectScale = 1): number {
  return 22 * zs * 1.25 * rejectScale;
}

/** How long a tap-revealed dial stays revealed without another tap. */
export const DIAL_TAP_REVEAL_MS = 4000;

export interface DialHitTarget {
  key: string;
  cx: number;
  cy: number;
  /** Currently drawn radius in px. */
  r: number;
}

/**
 * The dial a touch at `point` lands on: within its drawn radius `r` (only the
 * dial itself is tappable, so the tiles around and under it stay reachable);
 * the nearest centre wins when several qualify. Null for none.
 */
export function pickTappedDial(point: { x: number; y: number }, dials: DialHitTarget[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of dials) {
    const dist = Math.hypot(point.x - d.cx, point.y - d.cy);
    if (dist <= d.r && dist < bestDist) {
      best = d.key;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Next tap-revealed dial after a tap: tapping a dial reveals it, tapping the
 * revealed one again closes it, a tap elsewhere (`tapped` null) closes it too.
 */
export function nextTapReveal(current: string | null, tapped: string | null): string | null {
  return tapped !== null && tapped !== current ? tapped : null;
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
export const easeInOut = (t: number) => t * t * (3 - 2 * t);

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

/** How long the rejection animation (shake, pop, red cross, fade out) plays. */
export const DIAL_REJECT_MS = 1500;
const REJECT_SHAKE_MS = 420;

export interface DialRejectFrame {
  /** Horizontal shake offset in px. */
  offsetX: number;
  /** Dial size multiplier (pop, then shrink while fading). */
  scale: number;
  /** Red fill overlay strength 0..1. */
  flash: number;
  /** Cross draw progress 0..1. */
  cross: number;
  /** Expanding red hex shockwaves. */
  rings: { scale: number; alpha: number }[];
  /** Whole-dial opacity 0..1. */
  alpha: number;
}

const REJECT_SHAKE_OFFSETS = [0, -6, 6, -5, 5, -3, 0];

/**
 * Rejection animation state `msSinceReject` after the server refused the
 * build: shake (420 ms), pop, red flash, a cross drawn over it, two red
 * shockwaves, then fade and shrink from 1150 ms; null outside 0..1500 ms.
 * With reduced motion there is no shake, pop or rings.
 */
export function dialRejectFrame(msSinceReject: number, reducedMotion: boolean): DialRejectFrame | null {
  if (msSinceReject < 0 || msSinceReject >= DIAL_REJECT_MS) return null;
  const s = msSinceReject;
  let offsetX = 0;
  if (!reducedMotion && s < REJECT_SHAKE_MS) {
    // Seven evenly spaced keyframes, linearly interpolated.
    const pos = (s / REJECT_SHAKE_MS) * (REJECT_SHAKE_OFFSETS.length - 1);
    const i = Math.min(REJECT_SHAKE_OFFSETS.length - 2, Math.floor(pos));
    offsetX = REJECT_SHAKE_OFFSETS[i] + (REJECT_SHAKE_OFFSETS[i + 1] - REJECT_SHAKE_OFFSETS[i]) * (pos - i);
  }
  let scale = 1;
  if (!reducedMotion) {
    if (s < 150) scale = 1 + 0.12 * easeOut(s / 150);
    else if (s < 400) scale = 1.12 - 0.12 * ((s - 150) / 250);
  }
  const flash = s < 150 ? s / 150 : s < 500 ? 1 - 0.65 * ((s - 150) / 350) : 0.35;
  const rings = reducedMotion
    ? []
    : [0, 160].flatMap((start) => {
        const p = clamp01((s - start) / 700);
        return s < start || p >= 1 ? [] : [{ scale: 1 + 1.1 * easeOut(p), alpha: 0.9 * (1 - p) }];
      });
  const f = clamp01((s - 1150) / 350);
  return { offsetX, scale: scale * (1 - 0.4 * f), flash, cross: clamp01((s - 150) / 300), rings, alpha: 1 - f };
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

/**
 * The dials after the server refused the optimistic order on `coord`: its pending dial becomes a rejected one (shakes, fades,
 * is pruned). A hex that still shows a running build (a dial with timing, e.g. an upgrade queued behind it) keeps that dial
 * and gets no reject dial, so the refusal doesn't wipe the real progress.
 */
export function rejectDialAt(dials: ConstructionDial[], coord: AxialCoord, nowMs: number): ConstructionDial[] {
  const here = (d: ConstructionDial) => d.coord.q === coord.q && d.coord.r === coord.r;
  if (dials.some((d) => here(d) && d.endMs !== null)) return dials;
  return [...dials.filter((d) => !here(d)), { coord, startMs: null, endMs: null, state: 'pending', queuePosition: null, rejectedAtMs: nowMs }];
}

/**
 * What a dial shows at `nowMs`, for every surface that draws one (the canvas and the building HUD's marker dial): the finish
 * or rejection animation frame while one plays, else the order's own state. Null once a finish / rejection has played out (the
 * dial is pruned then).
 */
export type DialPhase =
  | { kind: 'finish'; frame: DialFinishFrame }
  | { kind: 'reject'; frame: DialRejectFrame }
  | { kind: 'pending' }
  | { kind: 'queued'; position: number | null }
  | { kind: 'building'; progress: number; remaining: number | null };

export function dialPhase(d: ConstructionDial, nowMs: number, reducedMotion: boolean): DialPhase | null {
  if (d.rejectedAtMs !== undefined) {
    const frame = dialRejectFrame(nowMs - d.rejectedAtMs, reducedMotion);
    return frame ? { kind: 'reject', frame } : null;
  }
  if (d.endMs !== null && nowMs >= d.endMs) {
    const frame = dialFinishFrame(nowMs - d.endMs);
    return frame ? { kind: 'finish', frame } : null;
  }
  if (d.state === 'pending') return { kind: 'pending' };
  if (d.state === 'queued') return { kind: 'queued', position: d.queuePosition };
  return { kind: 'building', progress: dialProgress(d, nowMs), remaining: dialRemainingSeconds(d, nowMs) };
}

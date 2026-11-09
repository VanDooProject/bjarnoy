/**
 * One dial per hex from the HUD build queue. `fetchedAt` is the `Date.now()`
 * at which `completesInSeconds` was measured. A 'building' order wins over a
 * 'waiting' one sharing the same hex.
 */
export function constructionDialsFromQueue(queue, fetchedAt) {
    const byHex = new Map();
    for (const o of queue) {
        const building = o.state === 'building';
        let startMs = null;
        let endMs = null;
        if (building && o.completesInSeconds !== null && o.totalSeconds > 0) {
            endMs = fetchedAt + o.completesInSeconds * 1000;
            startMs = endMs - o.totalSeconds * 1000;
        }
        const key = `${o.q},${o.r}`;
        const existing = byHex.get(key);
        if (existing && (existing.building || !building))
            continue;
        byHex.set(key, { dial: { coord: { q: o.q, r: o.r }, startMs, endMs }, building });
    }
    return [...byHex.values()].map((e) => e.dial);
}
/** Elapsed fraction 0..1 of the build at `nowMs`; 0 when timing is unknown. */
export function dialProgress(d, nowMs) {
    if (d.startMs === null || d.endMs === null || d.endMs <= d.startMs)
        return 0;
    return Math.min(1, Math.max(0, (nowMs - d.startMs) / (d.endMs - d.startMs)));
}
/** Seconds left at `nowMs`; null when timing is unknown (waiting order). */
export function dialRemainingSeconds(d, nowMs) {
    if (d.startMs === null || d.endMs === null)
        return null;
    return Math.max(0, (d.endMs - nowMs) / 1000);
}
/**
 * Flat [x, y, ...] polyline along a closed polygon's perimeter, from
 * `vertices[0]` in array order, covering `fraction` (clamped 0..1) of the
 * total perimeter LENGTH (edges may differ in length).
 */
export function polygonPerimeterPath(vertices, fraction) {
    const f = Math.min(1, Math.max(0, fraction));
    const n = vertices.length;
    if (f <= 0 || n < 2)
        return [];
    const lens = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % n];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        lens.push(l);
        total += l;
    }
    if (total <= 0)
        return [];
    let remaining = f * total;
    const out = [vertices[0].x, vertices[0].y];
    for (let i = 0; i < n; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % n];
        if (remaining >= lens[i] - 1e-9) {
            out.push(b.x, b.y);
            remaining -= lens[i];
            if (remaining <= 1e-9)
                break;
        }
        else {
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
export function hexPerimeterPath(cx, cy, r, fraction) {
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
export function polylinePartial(points, fraction) {
    const f = Math.min(1, Math.max(0, fraction));
    if (f <= 0 || points.length < 2)
        return [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++)
        total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (total <= 0)
        return [];
    let remaining = f * total;
    const out = [points[0].x, points[0].y];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (remaining >= l - 1e-9) {
            out.push(b.x, b.y);
            remaining -= l;
            if (remaining <= 1e-9)
                break;
        }
        else {
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
/**
 * Dial sizing. `mapScale` is `camera.zoom / SETTLEMENT_DEFAULT_ZOOM`: the dial
 * scales exactly with the map (no floor, so it stays the same fraction of a
 * tile at every zoom). The time label is dropped once it would be below
 * `DIAL_MIN_LABEL_PX` on screen. `hoverT` (0..1, the linear tween progress)
 * lifts the dial to at least its default-zoom size (`max(mapScale, 1)`, so a
 * dial already bigger than that never shrinks) and, from halfway, forces the
 * label. `rejectScale` is the rejection animation's shrink.
 */
export function dialScale(mapScale, hoverT, rejectScale = 1) {
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
export function dialHoverStep(t, hovered, dtMs, reducedMotion) {
    const target = hovered ? 1 : 0;
    if (reducedMotion)
        return target;
    const step = Math.max(0, dtMs) / DIAL_HOVER_MS;
    return target > t ? Math.min(target, t + step) : Math.max(target, t - step);
}
/** Dial hex radius in px at zoom factor `zs` (and reject shrink `rejectScale`). */
export function dialRadiusPx(zs, rejectScale = 1) {
    return 22 * zs * 1.25 * rejectScale;
}
/** How long a tap-revealed dial stays revealed without another tap. */
export const DIAL_TAP_REVEAL_MS = 4000;
/**
 * The dial a touch at `point` lands on: within its drawn radius `r` (only the
 * dial itself is tappable, so the tiles around and under it stay reachable);
 * the nearest centre wins when several qualify. Null for none.
 */
export function pickTappedDial(point, dials) {
    let best = null;
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
export function nextTapReveal(current, tapped) {
    return tapped !== null && tapped !== current ? tapped : null;
}
/** How long the completion animation plays after a build ends. */
export const DIAL_FINISH_MS = 2600;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => t * t * (3 - 2 * t);
/** Completion animation state `msSinceEnd` after the build ended; null outside it. */
export function dialFinishFrame(msSinceEnd) {
    if (msSinceEnd < 0 || msSinceEnd >= DIAL_FINISH_MS)
        return null;
    const t = msSinceEnd;
    let scale = 1;
    if (t < 180)
        scale = 1 + 0.22 * easeOut(t / 180);
    else if (t < 480)
        scale = 1.22 - 0.22 * easeInOut((t - 180) / 300);
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
const REJECT_SHAKE_OFFSETS = [0, -4, 4, -2, 0];
/**
 * Rejection animation state `msSinceReject` after the server refused the
 * build: a +-4 px shake over 280 ms, then fade and shrink to .6 over 200 ms;
 * null outside it.
 */
export function dialRejectFrame(msSinceReject) {
    if (msSinceReject < 0 || msSinceReject >= DIAL_REJECT_MS)
        return null;
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
export function retainFinishingDials(prev, next, nowMs) {
    const out = [...next];
    for (const d of prev) {
        // A refused build's dial outlives its (removed) pending order while it plays its rejection.
        if (d.rejectedAtMs !== undefined) {
            if (nowMs - d.rejectedAtMs < DIAL_REJECT_MS && !next.some((n) => n.coord.q === d.coord.q && n.coord.r === d.coord.r))
                out.push(d);
            continue;
        }
        if (d.endMs === null || d.endMs > nowMs + 5000)
            continue;
        if (next.some((n) => n.coord.q === d.coord.q && n.coord.r === d.coord.r))
            continue;
        const endMs = Math.min(d.endMs, nowMs);
        if (nowMs - endMs >= DIAL_FINISH_MS)
            continue;
        out.push({ ...d, endMs });
    }
    return out;
}
/**
 * The dials after the server refused the optimistic order on `coord`: its "…" dial becomes a rejected one (shakes, fades,
 * is pruned). A hex that still shows a running build (a dial with timing, e.g. an upgrade queued behind it) keeps that dial
 * and gets no reject dial, so the refusal doesn't wipe the real progress.
 */
export function rejectDialAt(dials, coord, nowMs) {
    const here = (d) => d.coord.q === coord.q && d.coord.r === coord.r;
    if (dials.some((d) => here(d) && d.endMs !== null))
        return dials;
    return [...dials.filter((d) => !here(d)), { coord, startMs: null, endMs: null, rejectedAtMs: nowMs }];
}

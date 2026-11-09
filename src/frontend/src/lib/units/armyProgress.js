/**
 * Whether a per-hex schedule can be trusted for this path: same length,
 * starting at 0, never going backwards, and actually spanning some time.
 * Anything else (a movement serialised before the backend exposed the field,
 * or a hand-built fixture) falls back to assuming every leg costs the same.
 */
function usableSchedule(path, cumulativeHours) {
    if (cumulativeHours && cumulativeHours.length === path.length && cumulativeHours[0] === 0) {
        let monotonic = true;
        for (let i = 1; i < cumulativeHours.length; i++) {
            if (!(cumulativeHours[i] >= cumulativeHours[i - 1]))
                monotonic = false;
        }
        if (monotonic && cumulativeHours[cumulativeHours.length - 1] > 0)
            return [...cumulativeHours];
    }
    return path.map((_, i) => i);
}
/**
 * Whether the edge-crossing schedule can be trusted: same length as the path, starting at 0, and every edge lies between the centres of the two
 * hexes it separates. Anything else (a movement serialised before the backend exposed the field, or a hand-built fixture) splits
 * each leg's time at its midpoint, which moves the marker at one even speed across the leg.
 */
function usableEdges(schedule, edgeHours) {
    if (edgeHours && edgeHours.length === schedule.length && edgeHours[0] === 0) {
        let valid = true;
        for (let i = 1; i < schedule.length; i++) {
            if (!(edgeHours[i] >= schedule[i - 1] && edgeHours[i] <= schedule[i]))
                valid = false;
        }
        if (valid)
            return [...edgeHours];
    }
    return schedule.map((h, i) => (i === 0 ? 0 : (schedule[i - 1] + h) / 2));
}
/**
 * Interpolates a position along `path` for the instant `nowMs`.
 *
 * `departedAtMs`/`arrivesAtMs` are wall-clock (the API's ISO instants) while
 * `cumulativeHours` is in *game* hours; rather than needing to know the ratio
 * between the two, the elapsed wall-clock fraction of the leg is mapped onto
 * the schedule's own total. That also means the two can never disagree about
 * when the army arrives.
 *
 * Returns `null` only for an empty path (nothing to place).
 */
export function routeProgressAt(path, cumulativeHours, edgeHours, departedAtMs, arrivesAtMs, nowMs) {
    if (path.length === 0)
        return null;
    if (path.length === 1) {
        return { from: path[0], to: path[0], t: 0, legIndex: 0, overall: 1, arrived: true };
    }
    const schedule = usableSchedule(path, cumulativeHours);
    const edges = usableEdges(schedule, edgeHours);
    const total = schedule[schedule.length - 1];
    const span = arrivesAtMs - departedAtMs;
    // A zero/negative span (a route with no travel time, or clocks that
    // disagree) has no meaningful fraction to compute — treat it as already
    // arrived rather than dividing by zero.
    const fraction = span > 0 ? (nowMs - departedAtMs) / span : 1;
    const clamped = Math.min(1, Math.max(0, fraction));
    const elapsed = clamped * total;
    if (clamped >= 1) {
        const last = path.length - 1;
        return { from: path[last], to: path[last], t: 0, legIndex: last, overall: 1, arrived: true };
    }
    let leg = 0;
    for (let i = 1; i < schedule.length; i++) {
        if (schedule[i] > elapsed)
            break;
        leg = i;
    }
    // The first half of the leg's distance is covered between the centre and the edge, the second half between the edge and the next
    // centre. Guard the (schedule-permitted) zero-length halves: equal hours would otherwise divide by zero.
    const edge = edges[leg + 1];
    let t;
    if (elapsed < edge) {
        const span1 = edge - schedule[leg];
        t = span1 > 0 ? (0.5 * (elapsed - schedule[leg])) / span1 : 0;
    }
    else {
        const span2 = schedule[leg + 1] - edge;
        t = span2 > 0 ? 0.5 + (0.5 * (elapsed - edge)) / span2 : 0.5;
    }
    return {
        from: path[leg],
        to: path[leg + 1],
        t: Math.min(1, Math.max(0, t)),
        legIndex: leg,
        overall: clamped,
        arrived: false,
    };
}
/** Linear interpolation between two screen/world points, for placing a marker at `progress.t`. */
export function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

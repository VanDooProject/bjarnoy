// Issue #94: where along its route an in-transit army actually *is* right
// now, as a fractional point between two hexes rather than the last hex it
// reached.
//
// The backend deliberately reports only the last hex reached
// (`Movement.PositionAt`, whose own doc comment calls smooth interpolation
// "a frontend rendering concern that can be layered on later") and the
// frontend only re-polls every `ARMY_POLL_MS` — so with nothing else, a
// marching army teleports a hex at a time and stands still in between.
//
// Everything needed to place it exactly is already on the wire and frozen at
// dispatch: the path, when the leg departed, when it arrives, and — since
// this issue's backend change — `cumulativeHours`, the per-hex schedule.
// That last one is what makes this exact rather than approximate: terrain
// makes legs cost very different amounts of time, so spreading the trip
// evenly over the path (the fallback below, for a movement that predates the
// field or arrives without it) drifts away from the authoritative position
// on mixed terrain.
//
// Pure and dependency-free, like the rest of lib/units — the renderer calls
// it once per army per frame, and its tests can pin `now` to a number
// instead of mocking a clock.
import type { AxialCoord } from '../hex/coords';

/** Where an army sits on its route: a fraction `t` along the leg `from` -> `to`. */
export interface RouteProgress {
  from: AxialCoord;
  to: AxialCoord;
  /** 0..1 along the current leg. */
  t: number;
  /** Index of `from` within the path — the leg is `path[legIndex] -> path[legIndex + 1]`. */
  legIndex: number;
  /** 0..1 over the whole route, for splitting it into travelled and remaining parts. */
  overall: number;
  /** True once the whole route has been travelled (the marker sits on the final hex). */
  arrived: boolean;
}

/**
 * Whether a per-hex schedule can be trusted for this path: same length,
 * starting at 0, never going backwards, and actually spanning some time.
 * Anything else (a movement serialised before the backend exposed the field,
 * or a hand-built fixture) falls back to assuming every leg costs the same.
 */
function usableSchedule(path: readonly AxialCoord[], cumulativeHours: readonly number[] | undefined): number[] {
  if (cumulativeHours && cumulativeHours.length === path.length && cumulativeHours[0] === 0) {
    let monotonic = true;
    for (let i = 1; i < cumulativeHours.length; i++) {
      if (!(cumulativeHours[i] >= cumulativeHours[i - 1])) monotonic = false;
    }
    if (monotonic && cumulativeHours[cumulativeHours.length - 1] > 0) return [...cumulativeHours];
  }
  return path.map((_, i) => i);
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
export function routeProgressAt(
  path: readonly AxialCoord[],
  cumulativeHours: readonly number[] | undefined,
  departedAtMs: number,
  arrivesAtMs: number,
  nowMs: number,
): RouteProgress | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    return { from: path[0], to: path[0], t: 0, legIndex: 0, overall: 1, arrived: true };
  }

  const schedule = usableSchedule(path, cumulativeHours);
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
    if (schedule[i] > elapsed) break;
    leg = i;
  }
  // Guard the (schedule-permitted) zero-length leg: two hexes with the same
  // cumulative hour would otherwise divide by zero.
  const legSpan = schedule[leg + 1] - schedule[leg];
  const t = legSpan > 0 ? (elapsed - schedule[leg]) / legSpan : 0;
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
export function lerpPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

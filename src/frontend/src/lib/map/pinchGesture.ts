// Two-finger pinch-to-zoom tracking — docs/design/zoom-transition.md §2/§9.
//
// Its own module rather than more of HexMapRenderer.ts, same reasoning as
// zoomTransition.ts: a pure, DOM-free tracker importable and testable under
// Vitest's Node environment, with no Pixi/pointer-event mocking needed. The
// renderer feeds it raw pointerdown/move/up positions (client coordinates,
// same space as its own `lastPointer`) and gets back a per-move `PinchStep`
// (midpoint + zoom factor + pan) that it can hand straight to `zoomBy`.

export interface Point {
  x: number;
  y: number;
}

export interface PinchStep {
  /** Midpoint of the two tracked touches at their new positions. */
  midpoint: Point;
  /** Ratio of the new inter-touch distance to the previous one — 1 means no change. */
  factor: number;
  /** How far the midpoint itself moved since the previous step. */
  pan: Point;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Below this inter-touch distance the ratio is unreliable (division by
// near-zero could yield Infinity/NaN, which would otherwise flow straight
// into camera.zoom) — treat the step as a pure translation instead.
const MIN_PINCH_DISTANCE_PX = 1;

/**
 * Pure step math: given the pinch pair's previous and next positions, what
 * zoom factor/midpoint/pan does this step represent. Exposed separately from
 * `PinchTracker` so the two can be unit-tested independently.
 */
export function pinchStep(prevA: Point, prevB: Point, nextA: Point, nextB: Point): PinchStep {
  const prevDist = distance(prevA, prevB);
  const nextDist = distance(nextA, nextB);
  const prevMid = midpoint(prevA, prevB);
  const nextMid = midpoint(nextA, nextB);
  const factor = prevDist < MIN_PINCH_DISTANCE_PX ? 1 : nextDist / prevDist;
  return {
    midpoint: nextMid,
    factor,
    pan: { x: nextMid.x - prevMid.x, y: nextMid.y - prevMid.y },
  };
}

/**
 * Tracks active touch pointers by `pointerId` and turns pairs of them into
 * pinch steps. Only the first two pointers (insertion order) ever drive the
 * geometry — a third+ finger is bookkept (so its later `up` doesn't confuse
 * the tracker) but otherwise ignored, matching how a real pinch gesture
 * degrades when a stray finger lands on the glass.
 *
 * Whenever the tracked *pair* changes composition (a second finger just went
 * down, or one of the pinch pair lifted and a different finger takes its
 * place) the next `move` only re-baselines — it reports `factor: 1, pan: 0`
 * — rather than comparing against a position from a different finger, which
 * would otherwise produce a spurious zoom/pan jump.
 */
export class PinchTracker {
  private pointers = new Map<number, Point>();
  private pairIds: [number, number] | null = null;
  private pairPositions: [Point, Point] | null = null;

  down(id: number, p: Point): void {
    this.pointers.set(id, p);
    this.pairIds = null;
    this.pairPositions = null;
  }

  /** Returns the pinch step for this move, or null if it doesn't affect the tracked pair. */
  move(id: number, p: Point): PinchStep | null {
    if (!this.pointers.has(id)) return null;
    this.pointers.set(id, p);
    if (this.pointers.size < 2) return null;

    const ids = [...this.pointers.keys()].slice(0, 2) as [number, number];
    if (!this.pairIds || ids[0] !== this.pairIds[0] || ids[1] !== this.pairIds[1]) {
      // Pair just changed (or this is the first move since forming a pair) — establish
      // a fresh baseline instead of comparing against a stale/foreign position.
      this.pairIds = ids;
      this.pairPositions = [this.pointers.get(ids[0])!, this.pointers.get(ids[1])!];
      return { midpoint: midpoint(...this.pairPositions), factor: 1, pan: { x: 0, y: 0 } };
    }
    if (id !== ids[0] && id !== ids[1]) return null;

    const [prevA, prevB] = this.pairPositions!;
    const nextA = this.pointers.get(ids[0])!;
    const nextB = this.pointers.get(ids[1])!;
    this.pairPositions = [nextA, nextB];
    return pinchStep(prevA, prevB, nextA, nextB);
  }

  up(id: number): void {
    this.pointers.delete(id);
    this.pairIds = null;
    this.pairPositions = null;
  }

  get count(): number {
    return this.pointers.size;
  }

  get isPinching(): boolean {
    return this.pointers.size >= 2;
  }

  /** The sole remaining tracked pointer, if exactly one is left. */
  primary(): { id: number; p: Point } | null {
    if (this.pointers.size !== 1) return null;
    const [[id, p]] = this.pointers;
    return { id, p };
  }

  clear(): void {
    this.pointers.clear();
    this.pairIds = null;
    this.pairPositions = null;
  }
}

// Two-finger pinch-to-zoom tracking — docs/design/zoom-transition.md §2/§9.
//
// Its own module rather than more of HexMapRenderer.ts, same reasoning as
// zoomTransition.ts: a pure, DOM-free tracker importable and testable under
// Vitest's Node environment, with no Pixi/pointer-event mocking needed. The
// renderer feeds it raw pointerdown/move/up positions (client coordinates,
// same space as its own `lastPointer`) and gets back a per-move `PinchStep`
// (midpoint + zoom factor + pan) that it can hand straight to `zoomBy`.
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a, b) {
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
export function pinchStep(prevA, prevB, nextA, nextB) {
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
    pointers = new Map();
    pairIds = null;
    pairPositions = null;
    down(id, p) {
        this.pointers.set(id, p);
        this.pairIds = null;
        this.pairPositions = null;
    }
    /** Returns the pinch step for this move, or null if it doesn't affect the tracked pair. */
    move(id, p) {
        if (!this.pointers.has(id))
            return null;
        this.pointers.set(id, p);
        if (this.pointers.size < 2)
            return null;
        const ids = [...this.pointers.keys()].slice(0, 2);
        if (!this.pairIds || ids[0] !== this.pairIds[0] || ids[1] !== this.pairIds[1]) {
            // Pair just changed (or this is the first move since forming a pair) — establish
            // a fresh baseline instead of comparing against a stale/foreign position.
            this.pairIds = ids;
            this.pairPositions = [this.pointers.get(ids[0]), this.pointers.get(ids[1])];
            return { midpoint: midpoint(...this.pairPositions), factor: 1, pan: { x: 0, y: 0 } };
        }
        if (id !== ids[0] && id !== ids[1])
            return null;
        const [prevA, prevB] = this.pairPositions;
        const nextA = this.pointers.get(ids[0]);
        const nextB = this.pointers.get(ids[1]);
        this.pairPositions = [nextA, nextB];
        return pinchStep(prevA, prevB, nextA, nextB);
    }
    up(id) {
        this.pointers.delete(id);
        this.pairIds = null;
        this.pairPositions = null;
    }
    get count() {
        return this.pointers.size;
    }
    get isPinching() {
        return this.pointers.size >= 2;
    }
    /** The sole remaining tracked pointer, if exactly one is left. */
    primary() {
        if (this.pointers.size !== 1)
            return null;
        const [[id, p]] = this.pointers;
        return { id, p };
    }
    clear() {
        this.pointers.clear();
        this.pairIds = null;
        this.pairPositions = null;
    }
}

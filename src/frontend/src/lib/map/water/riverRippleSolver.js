// Owns the river ripple worker, and decides per call whether a cell can go to it.
//
// Shaped like `WaterMaskBaker`, so the flow layer keeps asking one question —
// "solve this cell" — and does not grow its own state machine for in-flight
// requests and for the environments with no worker at all (jsdom, and any
// browser where constructing one throws). Unlike the baker, several cells are
// out at once, so requests are keyed rather than superseding each other.
import { computeRiverRipple } from './riverFlow';
export class RiverRippleSolver {
    worker = null;
    nextId = 1;
    onSolved;
    onLost;
    /** Request id to the cell key it was made for; a key is in here exactly while its reply is outstanding. */
    pending = new Map();
    pendingKeys = new Set();
    /** `onLost` runs when the worker dies with requests still out: those cells will never land, so the owner asks again (inline now). */
    constructor(onSolved, onLost = () => { }) {
        this.onSolved = onSolved;
        this.onLost = onLost;
        this.worker = createWorker();
        if (this.worker) {
            this.worker.onmessage = (event) => this.receive(event.data);
            // A worker that dies mid-session degrades to inline solving rather than
            // leaving the outstanding cells without flow for good: `onLost` tells
            // the owner to draw again, and `solve` then answers inline.
            this.worker.onerror = () => {
                const hadPending = this.pending.size > 0;
                this.worker = null;
                this.pending.clear();
                this.pendingKeys.clear();
                if (hadPending)
                    this.onLost?.();
            };
        }
    }
    /** Whether any request is still out. */
    get busy() {
        return this.pending.size > 0;
    }
    /**
     * The cell's ripple when it solved inline — which happens only where there is no worker — and null when the result
     * arrives through the callback instead. A key already in flight is not posted again.
     */
    solve(key, input) {
        if (!this.worker)
            return computeRiverRipple(input);
        if (this.pendingKeys.has(key))
            return null;
        const id = this.nextId++;
        this.pending.set(id, key);
        this.pendingKeys.add(key);
        const request = { id, input };
        this.worker.postMessage(request);
        return null;
    }
    destroy() {
        this.onSolved = null;
        this.onLost = null;
        this.pending.clear();
        this.pendingKeys.clear();
        this.worker?.terminate();
        this.worker = null;
    }
    receive(response) {
        const key = this.pending.get(response.id);
        if (key === undefined)
            return;
        this.pending.delete(response.id);
        this.pendingKeys.delete(key);
        this.onSolved?.(key, { data: response.data, psi: response.psi, inside: response.inside, periods: response.periods });
    }
}
/**
 * `null` wherever a module worker cannot be constructed — jsdom has no `Worker` at all, and a browser can refuse one
 * (a blocked blob/module URL, a restrictive CSP). Both solve inline, as the layer did before the worker existed.
 */
function createWorker() {
    if (typeof Worker === 'undefined')
        return null;
    try {
        return new Worker(new URL('./riverRipple.worker.ts', import.meta.url), { type: 'module' });
    }
    catch {
        return null;
    }
}

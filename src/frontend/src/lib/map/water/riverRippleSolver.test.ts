import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRiverRipple, topFacePolygonTexels, type RiverFlowInput } from './riverFlow';
import { RiverRippleSolver } from './riverRippleSolver';

const CW = 100;
const CH = 48;

/** A straight vertical channel flowing out of the bottom edge. */
function channelInput(): RiverFlowInput {
  const mask = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 40; x < 60; x++) mask[y * CW + x] = 255;
  return { mask, cw: CW, ch: CH, polygon: topFacePolygonTexels(0, 140), inEdges: [1], outEdge: 4 };
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: { id: number; input: RiverFlowInput }[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: { id: number; input: RiverFlowInput }) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number) {
    const bytes = () => new Uint8Array(4);
    this.onmessage?.({ data: { id, data: bytes(), psi: bytes(), inside: bytes(), periods: 3 } } as MessageEvent);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('RiverRippleSolver without a worker', () => {
  it('solves inline, to the same result as computeRiverRipple', () => {
    const solver = new RiverRippleSolver(() => {});
    const result = solver.solve('a', channelInput());
    const expected = computeRiverRipple(channelInput());
    expect(result).not.toBeNull();
    expect(result!.periods).toBe(expected.periods);
    expect(Array.from(result!.data)).toEqual(Array.from(expected.data));
    expect(solver.busy).toBe(false);
  });
});

describe('RiverRippleSolver with a worker', () => {
  function setup() {
    vi.stubGlobal('Worker', FakeWorker);
    const solved: string[] = [];
    const solver = new RiverRippleSolver((key) => solved.push(key));
    return { solver, solved, worker: FakeWorker.instances[0]! };
  }

  it('returns null, posts one message per key even when asked twice, and calls back on the reply', () => {
    const { solver, solved, worker } = setup();
    expect(solver.solve('a', channelInput())).toBeNull();
    expect(solver.solve('a', channelInput())).toBeNull();
    expect(solver.solve('b', channelInput())).toBeNull();
    expect(worker.posted).toHaveLength(2);
    expect(solver.busy).toBe(true);

    worker.reply(worker.posted[0]!.id);
    expect(solved).toEqual(['a']);
    expect(solver.busy).toBe(true);
    worker.reply(worker.posted[1]!.id);
    expect(solved).toEqual(['a', 'b']);
    expect(solver.busy).toBe(false);
  });

  it('may post a key again once its reply has landed', () => {
    const { solver, worker } = setup();
    solver.solve('a', channelInput());
    worker.reply(worker.posted[0]!.id);
    solver.solve('a', channelInput());
    expect(worker.posted).toHaveLength(2);
  });

  it('drops a reply that arrives after destroy, and terminates the worker', () => {
    const { solver, solved, worker } = setup();
    solver.solve('a', channelInput());
    solver.destroy();
    worker.reply(worker.posted[0]!.id);
    expect(solved).toEqual([]);
    expect(worker.terminated).toBe(true);
  });

  it('degrades to inline solving when the worker errors, and reports the cells it lost', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const lost = vi.fn();
    const solver = new RiverRippleSolver(() => {}, lost);
    const worker = FakeWorker.instances[0]!;
    solver.solve('a', channelInput());
    worker.onerror?.();
    expect(lost).toHaveBeenCalledOnce();
    expect(solver.busy).toBe(false);
    expect(solver.solve('a', channelInput())).not.toBeNull();
  });

  it('does not report a loss when the worker errors with nothing out', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const lost = vi.fn();
    new RiverRippleSolver(() => {}, lost);
    FakeWorker.instances[0]!.onerror?.();
    expect(lost).not.toHaveBeenCalled();
  });
});

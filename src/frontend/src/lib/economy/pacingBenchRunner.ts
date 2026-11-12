import type { BuildingDefinitionResponse } from '../../api/types';
import { runBench, type BenchKnobs, type BenchResult } from './pacingBench';
import type { BenchRequest, BenchResponse } from './pacingBench.worker';

export interface BenchRun {
  ms: number;
  result: BenchResult;
}

/**
 * Runs the bench off the main thread. Only the newest request is answered: a run superseded by a newer one is dropped
 * (its promise never settles). Where no module worker can be built (jsdom, a blocked worker URL) the run happens inline.
 */
export function createBenchRunner(): { run(byType: Record<string, BuildingDefinitionResponse[]>, knobs: BenchKnobs): Promise<BenchRun>; dispose(): void } {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./pacingBench.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  let latest = 0;
  let pending: { id: number; resolve: (r: BenchRun) => void; reject: (e: Error) => void } | null = null;
  if (worker) {
    worker.onmessage = (e: MessageEvent<BenchResponse>) => {
      const p = pending;
      if (!p || p.id !== e.data.id) return;
      pending = null;
      if ('error' in e.data) p.reject(new Error(e.data.error));
      else p.resolve({ ms: e.data.ms, result: e.data.result });
    };
    worker.onerror = (e) => {
      const p = pending;
      pending = null;
      p?.reject(new Error(e.message || 'The simulator worker failed'));
    };
  }
  return {
    run(byType, knobs) {
      const id = ++latest;
      if (!worker) {
        const t0 = performance.now();
        const result = runBench(byType, knobs);
        return Promise.resolve({ ms: Math.round(performance.now() - t0), result });
      }
      return new Promise<BenchRun>((resolve, reject) => {
        pending = { id, resolve, reject };
        worker!.postMessage({ id, byType, knobs } satisfies BenchRequest);
      });
    },
    dispose() {
      worker?.terminate();
      pending = null;
    },
  };
}

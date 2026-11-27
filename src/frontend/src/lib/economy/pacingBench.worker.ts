import type { BuildingDefinitionResponse } from '../../api/types';
import { runBench, type BenchKnobs, type BenchResult } from './pacingBench';

export interface BenchRequest {
  id: number;
  byType: Record<string, BuildingDefinitionResponse[]>;
  knobs: BenchKnobs;
}
export type BenchResponse = { id: number; ms: number; result: BenchResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<BenchRequest>) => {
  const { id, byType, knobs } = e.data;
  try {
    const t0 = performance.now();
    const result = runBench(byType, knobs);
    (self as unknown as Worker).postMessage({ id, ms: Math.round(performance.now() - t0), result } satisfies BenchResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies BenchResponse);
  }
};

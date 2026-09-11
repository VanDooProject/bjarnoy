// Owns the bake worker, and decides per call whether a bake can go to it.
//
// Pulled out of HexMapRenderer so the renderer keeps asking one question —
// "bake this region" — and does not grow a second state machine for in-flight
// requests, superseded results and the environments where there is no worker
// at all (jsdom, and any browser where constructing one throws).
import { bakeWaterMask, type TerrainLookup, type WaterMask } from './waterMask';
import type { WaterMaskRegion } from './waterMaskLayout';
import type { WorldGenerationConstants } from '../worldGenerator';
import type { BakeRequest, BakeResponse } from './waterMask.worker';

export interface AsyncBakeInput {
  region: WaterMaskRegion;
  tileWidth: number;
  tileHeight: number;
  seed: number;
  generation: WorldGenerationConstants;
}

export class WaterMaskBaker {
  private worker: Worker | null = null;
  /** Bumped per request; a response carrying anything older has been superseded. */
  private nextId = 1;
  private inFlightId = 0;
  private onDone: ((mask: WaterMask, region: WaterMaskRegion, bakeMs: number) => void) | null = null;
  private pending: { region: WaterMaskRegion } | null = null;

  constructor(handle: (mask: WaterMask, region: WaterMaskRegion, bakeMs: number) => void) {
    this.onDone = handle;
    this.worker = createWorker();
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<BakeResponse>) => this.receive(event.data);
      // A worker that dies mid-session should degrade to inline baking rather
      // than silently stop producing masks.
      this.worker.onerror = () => {
        this.worker = null;
        this.pending = null;
      };
    }
  }

  /** Whether a bake is currently out with the worker. */
  get busy(): boolean {
    return this.pending !== null;
  }

  /** The region the in-flight bake covers, or null when nothing is out. */
  get pendingRegion(): WaterMaskRegion | null {
    return this.pending?.region ?? null;
  }

  /**
   * Bakes `input.region`, on the worker when there is one.
   *
   * Returns the mask when it baked inline (no worker, or `terrain` carries the
   * building state only this thread has — see the worker's own header) and
   * null when the result will arrive through the callback instead. A request
   * posted while another is out supersedes it: the older result is dropped on
   * arrival rather than applied late over a newer one.
   */
  bake(input: AsyncBakeInput, terrain: TerrainLookup, mustBakeInline: boolean): WaterMask | null {
    if (mustBakeInline || !this.worker) return bakeWaterMask(input.region, input.tileWidth, input.tileHeight, terrain);
    const id = this.nextId++;
    this.inFlightId = id;
    this.pending = { region: input.region };
    const request: BakeRequest = {
      id,
      region: input.region,
      tileWidth: input.tileWidth,
      tileHeight: input.tileHeight,
      seed: input.seed,
      generation: input.generation,
    };
    this.worker.postMessage(request);
    return null;
  }

  /** Drops any in-flight result, for when the renderer has invalidated the mask outright (a mode flip, a reseed). */
  discardPending() {
    this.inFlightId = this.nextId++;
    this.pending = null;
  }

  destroy() {
    this.onDone = null;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private receive(response: BakeResponse) {
    const region = this.pending?.region;
    this.pending = null;
    if (response.id !== this.inFlightId || !region || !this.onDone) return;
    this.onDone({ data: response.data, width: response.width, height: response.height, region }, region, response.bakeMs);
  }
}

/**
 * `null` wherever a module worker cannot be constructed — jsdom under vitest
 * has no `Worker` at all, and a browser can refuse one (a blocked blob/module
 * URL, a restrictive CSP). Both fall back to baking inline, which is what the
 * renderer did before this existed, so neither is a broken map.
 */
function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./waterMask.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

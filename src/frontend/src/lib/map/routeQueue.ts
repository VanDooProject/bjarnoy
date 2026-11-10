// A route cache with a time-sliced job queue: the send picker asks for the route of every field army, and a search that finds no route can
// run for a second or more. Asking never blocks: `routeOrQueue` answers from the cache or says "pending" (`undefined`) and queues the
// search, which the runner works off in ~8 ms slices between yields to the event loop. Every finished job bumps `routeCacheVersion`, so
// computeds that read it re-run once the answer is there.
import { shallowRef } from 'vue';
import type { AxialCoord } from '../hex/coords';

export interface RouteResult {
  path: AxialCoord[];
  cost: number;
}

export type RouteJob = Generator<void, RouteResult | null, void>;

/** Time the runner works before it yields to the event loop. */
export const SLICE_MS = 8;

/** Bumped whenever a queued search finishes; read it inside a computed to depend on the cache. */
export const routeCacheVersion = shallowRef(0);

const cache = new Map<string, RouteResult | null>();
const queued = new Set<string>();
const queue: Array<{ key: string; job: RouteJob }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let epoch = 0;

export function routeKey(from: AxialCoord, to: AxialCoord, fleet: boolean): string {
  return `${from.q},${from.r}|${to.q},${to.r}|${fleet ? 'f' : 'l'}`;
}

/** The cached route (or `null` for none), or `undefined` while it is still being searched; the search is queued once per key. */
export function routeOrQueue(key: string, start: () => RouteJob): RouteResult | null | undefined {
  if (cache.has(key)) return cache.get(key);
  if (!queued.has(key)) {
    queued.add(key);
    queue.push({ key, job: start() });
    schedule();
  }
  return undefined;
}

/** Forgets every cached route and abandons the queue (a search in flight is dropped); readers of `routeCacheVersion` re-run. */
export function clearRouteCache(): void {
  epoch++;
  cache.clear();
  queued.clear();
  queue.length = 0;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  routeCacheVersion.value++;
}

function schedule(): void {
  if (timer === null) timer = setTimeout(run, 0);
}

function run(): void {
  timer = null;
  const myEpoch = epoch;
  const deadline = performance.now() + SLICE_MS;
  while (queue.length > 0 && performance.now() < deadline) {
    const head = queue[0]!;
    const step = head.job.next();
    if (myEpoch !== epoch) return;
    if (step.done) {
      queue.shift();
      queued.delete(head.key);
      cache.set(head.key, step.value);
      routeCacheVersion.value++;
    }
  }
  if (queue.length > 0) schedule();
}

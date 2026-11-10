import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRouteCache, routeCacheVersion, routeKey, routeOrQueue, type RouteJob } from './routeQueue';

const RESULT = { path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], cost: 1 };

/** A job that needs `slices` resumes before it finishes. */
function job(slices: number, result: typeof RESULT | null, started?: () => void): () => RouteJob {
  return function* () {
    started?.();
    for (let i = 0; i < slices; i++) yield;
    return result;
  };
}

describe('routeQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRouteCache();
  });
  afterEach(() => {
    clearRouteCache();
    vi.useRealTimers();
  });

  it('is pending first, then answers from the cache once the runner has worked, and bumps the version', async () => {
    const before = routeCacheVersion.value;
    expect(routeOrQueue('a', job(3, RESULT))).toBeUndefined();
    expect(routeCacheVersion.value).toBe(before);
    await vi.runAllTimersAsync();
    expect(routeOrQueue('a', job(0, null))).toEqual(RESULT);
    expect(routeCacheVersion.value).toBe(before + 1);
  });

  it('caches "no route" as null, distinct from pending', async () => {
    routeOrQueue('none', job(1, null));
    await vi.runAllTimersAsync();
    expect(routeOrQueue('none', job(0, RESULT))).toBeNull();
  });

  it('starts a job once per key however often it is asked', async () => {
    const started = vi.fn();
    for (let i = 0; i < 5; i++) routeOrQueue('dup', job(2, RESULT, started));
    await vi.runAllTimersAsync();
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('works through the queue first in, first out, and spreads a long search over several timer slices', async () => {
    const order: string[] = [];
    const tagged = (name: string, slices: number): (() => RouteJob) =>
      function* () {
        for (let i = 0; i < slices; i++) yield;
        order.push(name);
        return RESULT;
      };
    routeOrQueue('first', tagged('first', 2));
    routeOrQueue('second', tagged('second', 0));
    // The fake clock never advances inside a slice, so a slice only ends when the queue is empty: advance it per step instead.
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 5));
    await vi.runAllTimersAsync();
    expect(order).toEqual(['first', 'second']);
    expect(routeOrQueue('second', job(0, null))).toEqual(RESULT);
  });

  it('does not work the whole queue in one timer callback', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 5));
    for (let i = 0; i < 10; i++) routeOrQueue(`k${i}`, job(0, RESULT));
    await vi.advanceTimersByTimeAsync(0);
    const doneAfterFirstSlice = [...Array(10).keys()].filter((i) => routeOrQueue(`k${i}`, job(0, RESULT)) !== undefined).length;
    expect(doneAfterFirstSlice).toBeGreaterThan(0);
    expect(doneAfterFirstSlice).toBeLessThan(10);
    await vi.runAllTimersAsync();
    expect(routeOrQueue('k9', job(0, null))).toEqual(RESULT);
  });

  it('clearRouteCache forgets results and abandons queued and running searches', async () => {
    const started = vi.fn();
    routeOrQueue('done', job(0, RESULT));
    await vi.runAllTimersAsync();
    routeOrQueue('queued', job(3, RESULT, started));
    clearRouteCache();
    await vi.runAllTimersAsync();
    expect(started).not.toHaveBeenCalled();
    expect(routeOrQueue('done', job(0, null))).toBeUndefined();
    expect(routeOrQueue('queued', job(0, null))).toBeUndefined();
  });

  it('keys a route by both ends and the fleet flag', () => {
    const a = { q: 1, r: 2 };
    const b = { q: 3, r: 4 };
    expect(new Set([routeKey(a, b, false), routeKey(a, b, true), routeKey(b, a, false)]).size).toBe(3);
  });
});

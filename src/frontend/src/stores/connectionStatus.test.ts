import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConnectionStatusStore } from './connectionStatus';

describe('connectionStatus store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('has no latest issue while healthy', () => {
    expect(useConnectionStatusStore().latest).toBeNull();
  });

  it('counts consecutive failures per key and resets them on clear', () => {
    const store = useConnectionStatusStore();
    store.report('trade', new Error('a'));
    store.report('trade', new Error('b'));
    expect(store.issues.trade?.failures).toBe(2);
    expect((store.issues.trade?.error as Error).message).toBe('b');

    store.clear('trade');
    expect(store.issues.trade).toBeUndefined();
    store.report('trade', new Error('c'));
    expect(store.issues.trade?.failures).toBe(1);
  });

  it('latest is the most recently failed key, and falls back when that one clears', () => {
    const store = useConnectionStatusStore();
    store.report('settlement', new Error('old'));
    vi.advanceTimersByTime(1000);
    store.report('armies', new Error('new'));
    expect(store.latest?.key).toBe('armies');

    store.clear('armies');
    expect(store.latest?.key).toBe('settlement');
    store.clear('settlement');
    expect(store.latest).toBeNull();
  });
});

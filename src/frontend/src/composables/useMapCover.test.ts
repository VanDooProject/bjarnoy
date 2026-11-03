import { effectScope, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { mapCovered, useCoversMap } from './useMapCover';

describe('useCoversMap', () => {
  it('covers the map while active and releases when it turns off', async () => {
    const scope = effectScope();
    const active = ref(true);
    scope.run(() => useCoversMap(active));
    expect(mapCovered.value).toBe(true);
    active.value = false;
    await Promise.resolve();
    expect(mapCovered.value).toBe(false);
    active.value = true;
    await Promise.resolve();
    expect(mapCovered.value).toBe(true);
    scope.stop();
    expect(mapCovered.value).toBe(false);
  });

  it('stays covered until every caller has released', () => {
    const a = effectScope();
    const b = effectScope();
    a.run(() => useCoversMap(true));
    b.run(() => useCoversMap(true));
    a.stop();
    expect(mapCovered.value).toBe(true);
    b.stop();
    expect(mapCovered.value).toBe(false);
  });

  it('does not cover when never active, and disposing does not go negative', () => {
    const scope = effectScope();
    scope.run(() => useCoversMap(false));
    expect(mapCovered.value).toBe(false);
    scope.stop();
    const other = effectScope();
    other.run(() => useCoversMap(true));
    expect(mapCovered.value).toBe(true);
    other.stop();
    expect(mapCovered.value).toBe(false);
  });
});

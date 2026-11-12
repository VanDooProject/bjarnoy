import { beforeEach, describe, expect, it } from 'vitest';
import { useMapFocus } from './useMapFocus';

describe('useMapFocus', () => {
  beforeEach(() => useMapFocus().clear());

  it('holds the requested hex until the map clears it', () => {
    const map = useMapFocus();
    expect(map.pending.value).toBeNull();

    map.request({ q: 3, r: -2 });
    expect(map.pending.value?.coord).toEqual({ q: 3, r: -2 });

    map.clear();
    expect(map.pending.value).toBeNull();
  });

  it('shares one request between callers, and asking for the same hex again is a new request', () => {
    const first = useMapFocus();
    first.request({ q: 1, r: 1 });
    const seqA = useMapFocus().pending.value?.seq;

    first.request({ q: 1, r: 1 });
    expect(useMapFocus().pending.value?.seq).toBeGreaterThan(seqA!);
  });
});

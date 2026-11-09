import { describe, expect, it } from 'vitest';
import { WORLD_FOCUS_ZOOM, parseCameraHash, serializeCameraHash, worldMapLocation } from './mapCameraHash';
import { isWorldHash } from './mapModeRoute';

describe('map camera hash', () => {
  it('serialises the hex and a two-decimal zoom', () => {
    expect(serializeCameraHash({ coord: { q: -3, r: 12 }, zoom: 1.2345 })).toBe('#q=-3&r=12&z=1.23');
  });

  it('round-trips a view (zoom to two decimals)', () => {
    const view = { coord: { q: 40, r: -7 }, zoom: 0.85 };
    expect(parseCameraHash(serializeCameraHash(view))).toEqual(view);
  });

  it('keeps the anchor behind the world marker', () => {
    const view = { coord: { q: 40, r: -7 }, zoom: 0.22 };
    expect(serializeCameraHash(view, true)).toBe('#world&q=40&r=-7&z=0.22');
    expect(parseCameraHash('#world&q=40&r=-7&z=0.22')).toEqual(view);
  });

  it('recognises the world marker with and without an anchor', () => {
    expect(isWorldHash('#world')).toBe(true);
    expect(isWorldHash('#world&q=1&r=2&z=0.22')).toBe(true);
    expect(isWorldHash('')).toBe(false);
    expect(isWorldHash('#worldly')).toBe(false);
    expect(isWorldHash('#q=1&r=2&z=1')).toBe(false);
  });

  it.each(['', '#', '#world', '#q=1&r=2', '#q=1&z=1', '#q=a&r=2&z=1', '#q=1.5&r=2&z=1', '#q=1&r=2&z=NaN', '#q=1&r=2&z=', '#q=1&r=2&z=0', '#q=1&r=2&z=-1', 'q=1&r=2&z=1'])(
    'ignores %j',
    (hash) => {
      expect(parseCameraHash(hash)).toBeNull();
    },
  );
});

describe('worldMapLocation', () => {
  it('points the map route at the hex in world mode, in a form parseCameraHash reads back', () => {
    const location = worldMapLocation({ q: -3, r: 7 });
    expect(location.path).toBe('/settlement');
    expect(parseCameraHash(location.hash)).toEqual({ coord: { q: -3, r: 7 }, zoom: WORLD_FOCUS_ZOOM });
    expect(isWorldHash(location.hash)).toBe(true);
  });
});

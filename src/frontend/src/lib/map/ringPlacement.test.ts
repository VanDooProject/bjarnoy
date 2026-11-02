import { afterEach, describe, expect, it, vi } from 'vitest';
import { ringShapes } from './ringLayout';
import { placeRing, RING_ROOM_PAN_MS } from './ringPlacement';

// The one place a ring's tile is brought to where the ring fits as a circle; MapView and the
// onboarding page both open their ring through it.
describe('placeRing', () => {
  const area = { left: 16, top: 12, right: 304, bottom: 324 }; // the onboarding page at 320x568
  const shapes = ringShapes(1, [2, 3, 2]);

  afterEach(() => vi.restoreAllMocks());

  it('leaves the map alone when the ring already fits round the tile', () => {
    const renderer = { panScreenBy: vi.fn(() => true) };
    expect(placeRing(renderer, { x: 160, y: 170 }, () => area, shapes)).toEqual({ x: 160, y: 170, scale: 1 });
    expect(renderer.panScreenBy).not.toHaveBeenCalled();
  });

  it('pans the map by the distance the tile has to move and returns where the tile ends up', () => {
    const renderer = { panScreenBy: vi.fn(() => true) };
    const placed = placeRing(renderer, { x: 160, y: 400 }, () => area, shapes);
    expect(placed.scale).toBe(1);
    expect(placed.y).toBeLessThan(400);
    const [dx, dy, ms] = renderer.panScreenBy.mock.calls[0] as unknown as [number, number, number];
    expect(dx).toBeCloseTo(placed.x - 160);
    expect(dy).toBeCloseTo(placed.y - 400);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(RING_ROOM_PAN_MS);
  });

  it('keeps the tile where it is when the map cannot move', () => {
    const renderer = { panScreenBy: vi.fn(() => false) };
    expect(placeRing(renderer, { x: 160, y: 400 }, () => area, shapes)).toMatchObject({ x: 160, y: 400 });
    expect(placeRing(null, { x: 160, y: 400 }, () => area, shapes)).toMatchObject({ x: 160, y: 400 });
  });
});

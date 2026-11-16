import { describe, expect, it } from 'vitest';
import { exploredShare, frameCameraFor, type FrameCamera } from './frameCamera';

const viewport = { width: 400, height: 800 };
const opts = { margin: 40, bottomInset: 0, minZoom: 0.3 };
const screenOf = (cam: FrameCamera, p: { x: number; y: number }) => ({
  x: viewport.width / 2 + (p.x - cam.x) * cam.zoom,
  y: viewport.height / 2 + (p.y - cam.y) * cam.zoom,
});

describe('frameCameraFor', () => {
  const camera = { x: 1000, y: 1000, zoom: 1 };

  it('stays put when every point is already on screen', () => {
    expect(frameCameraFor(camera, viewport, [{ x: 1000, y: 1000 }, { x: 1100, y: 1200 }], opts)).toBeNull();
  });

  it('pans only by what sticks out, at the same zoom', () => {
    // 300 world px right of centre is screen x 500, 140 px past the right edge (400 - 40).
    const to = frameCameraFor(camera, viewport, [{ x: 1000, y: 1000 }, { x: 1300, y: 1000 }], opts)!;
    expect(to.zoom).toBe(1);
    expect(to.y).toBe(1000);
    expect(screenOf(to, { x: 1300, y: 1000 }).x).toBeCloseTo(360);
    // The point that was on screen stays on screen.
    expect(screenOf(to, { x: 1000, y: 1000 }).x).toBeGreaterThanOrEqual(40);
  });

  it('zooms out as far as the points need, never in', () => {
    const to = frameCameraFor(camera, viewport, [{ x: 600, y: 1000 }, { x: 1400, y: 1000 }], opts)!;
    expect(to.zoom).toBeCloseTo(320 / 800);
    for (const p of [{ x: 600, y: 1000 }, { x: 1400, y: 1000 }]) {
      const s = screenOf(to, p);
      expect(s.x).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(s.x).toBeLessThanOrEqual(360 + 1e-6);
    }
    const zoomedOut = { x: 1000, y: 1000, zoom: 0.5 };
    expect(frameCameraFor(zoomedOut, viewport, [{ x: 1000, y: 1000 }, { x: 1010, y: 1010 }], opts)).toBeNull();
  });

  it('keeps the points above a bottom sheet', () => {
    // Screen y 600 is under a sheet covering the bottom 400 px of 800.
    const to = frameCameraFor(camera, viewport, [{ x: 1000, y: 1200 }], { ...opts, bottomInset: 400 })!;
    expect(screenOf(to, { x: 1000, y: 1200 }).y).toBeCloseTo(800 - 400 - 40);
  });

  it('pans the other way for a point off the left and top edges', () => {
    const to = frameCameraFor(camera, viewport, [{ x: 1000, y: 1000 }, { x: 800, y: 500 }], opts)!;
    expect(to.zoom).toBe(1);
    const s = screenOf(to, { x: 800, y: 500 });
    expect(s.x).toBeCloseTo(40);
    expect(s.y).toBeCloseTo(40);
  });

  it('zooms out and pans together when the points sit off to one side', () => {
    const points = [{ x: 1100, y: 1000 }, { x: 2000, y: 1000 }];
    const to = frameCameraFor(camera, viewport, points, opts)!;
    expect(to.zoom).toBeCloseTo(320 / 900);
    expect(screenOf(to, points[0]!).x).toBeCloseTo(40);
    expect(screenOf(to, points[1]!).x).toBeCloseTo(360);
  });

  it('centres points that do not fit even at the furthest zoom', () => {
    const to = frameCameraFor(camera, viewport, [{ x: 0, y: 1000 }, { x: 4000, y: 1000 }], opts)!;
    expect(to.zoom).toBe(0.3);
    expect(to.x).toBeCloseTo(2000);
  });
});

describe('exploredShare', () => {
  // At zoom 1 the 400 x 800 viewport shows world x 800..1200 and y 600..1400 round the centre (1000, 1000).
  const camera = { x: 1000, y: 1000, zoom: 1 };
  const exploredLeftOf1000 = (x: number) => x < 1000;

  it('is the share of the view that is explored', () => {
    expect(exploredShare(camera, viewport, exploredLeftOf1000)).toBe(0.5);
    expect(exploredShare(camera, viewport, () => true)).toBe(1);
    expect(exploredShare(camera, viewport, () => false)).toBe(0);
  });

  it('drops when the camera pans or zooms out into the mist', () => {
    expect(exploredShare({ ...camera, x: 1100 }, viewport, exploredLeftOf1000)).toBeLessThan(0.5);
    const island = (x: number, y: number) => Math.abs(x - 1000) < 200 && Math.abs(y - 1000) < 400;
    expect(exploredShare(camera, viewport, island)).toBe(1);
    expect(exploredShare({ ...camera, zoom: 0.5 }, viewport, island)).toBeCloseTo(0.25);
  });

  it('does not count what a bottom sheet covers', () => {
    // Explored only below world y 1100: under a sheet covering the bottom 300 px, nothing of it is seen.
    const below = (_x: number, y: number) => y > 1100;
    expect(exploredShare(camera, viewport, below)).toBeGreaterThan(0);
    expect(exploredShare(camera, viewport, below, 300)).toBe(0);
  });
});

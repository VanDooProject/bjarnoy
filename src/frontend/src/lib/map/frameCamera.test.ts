import { describe, expect, it } from 'vitest';
import { frameCameraFor, type FrameCamera } from './frameCamera';

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

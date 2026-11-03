import { describe, expect, it } from 'vitest';
import { createFogField, fogNoise } from './fogTexture';

describe('fogNoise', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(Array.from(fogNoise(32, 1))).toEqual(Array.from(fogNoise(32, 1)));
    expect(Array.from(fogNoise(32, 1))).not.toEqual(Array.from(fogNoise(32, 2)));
  });

  it('stays within [0,1] and is not flat', () => {
    const n = fogNoise(64, 7);
    expect(n.length).toBe(64 * 64);
    let min = 1;
    let max = 0;
    for (const v of n) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(0.2);
  });

  it('is periodic in both axes so the texture tiles seamlessly', () => {
    const size = 64;
    const f = createFogField(size, 3);
    for (const [x, y] of [[0, 0], [5.5, 17], [63, 40], [30, 63.5]]) {
      expect(f(x + size, y)).toBeCloseTo(f(x, y), 6);
      expect(f(x, y + size)).toBeCloseTo(f(x, y), 6);
    }
  });

  it('continues smoothly across the wrap edge', () => {
    const size = 64;
    const n = fogNoise(size, 3);
    const f = createFogField(size, 3);
    let maxStep = 0;
    for (let y = 0; y < size; y++) maxStep = Math.max(maxStep, Math.abs(n[y * size + 1] - n[y * size]));
    for (let y = 0; y < size; y++) {
      // last column -> first column is just another neighbouring step
      expect(Math.abs(f(size, y) - n[y * size + size - 1])).toBeLessThanOrEqual(maxStep + 0.05);
    }
  });
});

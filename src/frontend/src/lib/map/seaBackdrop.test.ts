// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SEA_BACKDROP_FRAGMENT, SeaBackdrop, WORLD_SEA_GRADIENT } from './seaBackdrop';
import { hexToRgb01 } from './shaderResources';

// Pixi's GlProgram constructor probes a throwaway canvas; jsdom has none (see WaterLayer.test.ts).
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

describe('SeaBackdrop', () => {
  it('covers the screen rectangle with a full 0..1 UV range after resize', () => {
    const backdrop = new SeaBackdrop();
    backdrop.resize(800, 600);
    const geometry = backdrop.mesh.geometry;
    expect(Array.from(geometry.getBuffer('aPosition').data)).toEqual([0, 0, 800, 0, 800, 600, 0, 600]);
    expect(Array.from(geometry.getBuffer('aUV').data)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    backdrop.resize(320, 200);
    expect(Array.from(geometry.getBuffer('aPosition').data)).toEqual([0, 0, 320, 0, 320, 200, 0, 200]);
    backdrop.destroy();
  });

  it('does not take part in hit-testing', () => {
    const backdrop = new SeaBackdrop();
    expect(backdrop.mesh.eventMode).toBe('none');
    backdrop.destroy();
  });
});

describe('SEA_BACKDROP_FRAGMENT', () => {
  it('is generated from every stop of the gradient', () => {
    for (const stop of WORLD_SEA_GRADIENT.stops) {
      const [r, g, b] = hexToRgb01(stop.color).map((v) => v.toFixed(6));
      expect(SEA_BACKDROP_FRAGMENT).toContain(`vec3(${r}, ${g}, ${b})`);
    }
  });

  it('is opaque', () => {
    expect(SEA_BACKDROP_FRAGMENT).toContain('finalColor = vec4(col, 1.0);');
  });
});

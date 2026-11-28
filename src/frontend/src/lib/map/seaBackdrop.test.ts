// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SEA_BACKDROP_FRAGMENT, SeaBackdrop, WORLD_SEA_GRADIENT_CSS } from './seaBackdrop';

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
});

describe('WORLD_SEA_GRADIENT_CSS', () => {
  it('is the world map sea the container showed before the gradient moved into the canvas', () => {
    expect(WORLD_SEA_GRADIENT_CSS).toBe('radial-gradient(115% 100% at 45% 40%, #2a92ae 0%, #14657f 48%, #0b3c50 100%)');
  });
});

describe('SEA_BACKDROP_FRAGMENT', () => {
  it('is opaque', () => {
    expect(SEA_BACKDROP_FRAGMENT).toContain('finalColor = vec4(col, 1.0);');
  });
});

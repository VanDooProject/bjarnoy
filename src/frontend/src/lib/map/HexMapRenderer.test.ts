import { describe, expect, it } from 'vitest';
import { landfallBurstFrames, plotRippleFrames, previewFitZoom, terrainTitleFor, worldLayerOrder } from './HexMapRenderer';
import type { RiverTile, Tile } from './types';
import type { AxialCoord } from '../hex/coords';

// Regression coverage for a reported bug: a river mouth's hover tooltip
// read "Shore" (its underlying sand terrain) instead of naming the river
// actually drawn there — terrainTitleFor is the tooltip's title logic,
// extracted out of HexMapRenderer.hoverInfoFor (which is otherwise
// untestable without a real canvas/Pixi renderer) so this one rule can be
// checked directly.

function tileOf(terrain: Tile['terrain']): Tile {
  return { q: 0, r: 0, terrain };
}

const river: RiverTile = { q: 0, r: 0, shape: 'mouth', inDirections: ['NE'], outDirection: null };

describe('terrainTitleFor', () => {
  it('names the underlying terrain when there is no river', () => {
    expect(terrainTitleFor(tileOf('sand'), undefined)).toEqual({ terrain: 'sand', isRiver: false });
    expect(terrainTitleFor(tileOf('grass'), undefined)).toEqual({ terrain: 'grass', isRiver: false });
  });

  it('flags the river instead of the underlying terrain when one is present — even on sand (the reported case)', () => {
    expect(terrainTitleFor(tileOf('sand'), river)).toEqual({ terrain: 'sand', isRiver: true });
  });

  it('flags the river regardless of which terrain it sits on', () => {
    for (const terrain of ['sea', 'sand', 'grass', 'forest', 'mountain'] as const) {
      expect(terrainTitleFor(tileOf(terrain), river)).toEqual({ terrain, isRiver: true });
    }
  });
});

// The regression test for the whole of docs/design/water-shader.md §3.
// Layering is the hard part of the water feature and getting it wrong fails
// silently — water over the tall art, or under the islands it is supposed to
// lap against, both just look like a bad shader rather than a bug. Asserted on
// the pure ordering function rather than a mounted renderer for the same reason
// terrainTitleFor is extracted: `world`'s real children need a canvas and a
// Pixi Application, and this is our stack, not a third-party library.
describe('worldLayerOrder', () => {
  const indexIn = (mode: 'world' | 'settlement', name: string) => worldLayerOrder(mode).indexOf(name as never);

  it('puts the water mesh under the island polygons in world mode', () => {
    // §3.2: there is no water in the world-map canvas at all today (the sea is
    // a CSS gradient behind it), so the mesh fills an empty canvas and the
    // opaque terrainFlat hexes cover it wherever there is land.
    expect(worldLayerOrder('world')[0]).toBe('water');
    expect(indexIn('world', 'water')).toBeLessThan(indexIn('world', 'terrainFlat'));
  });

  it('puts the water mesh above the ground art and below the tall art in settlement mode', () => {
    // §3.3. The second half is what keeps a magictower's spire out of the
    // water: anything routed to terrainTop draws above the mesh by
    // construction, whatever the art's height (see legacyTileSplit.ts).
    expect(indexIn('settlement', 'terrainBase')).toBeLessThan(indexIn('settlement', 'water'));
    expect(indexIn('settlement', 'water')).toBeLessThan(indexIn('settlement', 'terrainTop'));
  });

  it('keeps the foam’s inward bleed clipped by real land geometry', () => {
    // §3.5: the foam band is allowed to run slightly onto land (the mask's G
    // channel), and in *both* views the land art draws above the mesh, so that
    // bleed is clipped for free rather than needing shader work.
    for (const mode of ['world', 'settlement'] as const) {
      const land = mode === 'world' ? 'terrainFlat' : 'terrainTop';
      expect(indexIn(mode, 'water')).toBeLessThan(indexIn(mode, land));
    }
  });

  it('never splits terrainBase into sea and land halves', () => {
    // The wrong answer an earlier draft of the plan reached, kept as an
    // assertion because it is not obviously wrong: every tile in the pack,
    // water included, has a 68px skirt, and a land tile's skirt reaches into
    // the top face of the water hex diagonally in front of it. Grouping all
    // the sea before all the land breaks that occlusion along every shore —
    // which is exactly where the foam is.
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(order.filter((name) => name === 'terrainBase')).toHaveLength(1);
    }
  });

  it('contains every layer exactly once in both modes', () => {
    // World mode gets one extra layer, 'rivers' (the vector-line river
    // strokes) — settlement mode draws rivers as sprite tile art baked into
    // terrainBase/terrainTop instead (riverTexturesFor), so it never adds
    // 'rivers' to its own order.
    const expectedLength = { world: 10, settlement: 9 } as const;
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(new Set(order).size).toBe(order.length);
      expect(order).toHaveLength(expectedLength[mode]);
    }
  });

  it('draws rivers above the terrain fill and below realm borders in world mode', () => {
    expect(indexIn('world', 'terrainFlat')).toBeLessThan(indexIn('world', 'rivers'));
    expect(indexIn('world', 'rivers')).toBeLessThan(indexIn('world', 'borders'));
  });
});

// Regression coverage for the landing page's locked static preview
// (docs/design/zoom-transition.md §6): the whole island must fit on screen
// at any viewport size/aspect, biased or not. Asserted on the pure function
// (no worldModel/canvas needed) for the same reason as terrainTitleFor/
// worldLayerOrder above.
describe('previewFitZoom', () => {
  const center: AxialCoord = { q: 0, r: 0 };
  const noSea = () => false;
  const allSea = () => true;

  it('falls back before the viewport is known', () => {
    expect(
      previewFitZoom({
        center,
        radius: 7,
        screenBiasX: 0,
        viewport: { width: 0, height: 0 },
        isSea: noSea,
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      }),
    ).toBe(0.6);
  });

  it('falls back when every hex in range is sea', () => {
    expect(
      previewFitZoom({
        center,
        radius: 7,
        screenBiasX: 0,
        viewport: { width: 1200, height: 800 },
        isSea: allSea,
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      }),
    ).toBe(0.6);
  });

  it('zooms out further for a wider radius of land, all else equal', () => {
    const zoomFor = (radius: number) =>
      previewFitZoom({
        center,
        radius,
        screenBiasX: 0,
        viewport: { width: 1200, height: 800 },
        isSea: noSea,
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      });
    expect(zoomFor(7)).toBeLessThan(zoomFor(2));
  });

  it('zooms out further when a screen bias narrows the usable half-width', () => {
    const zoomFor = (screenBiasX: number) =>
      previewFitZoom({
        center,
        radius: 7,
        screenBiasX,
        viewport: { width: 1200, height: 800 },
        isSea: noSea,
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      });
    expect(zoomFor(0.16)).toBeLessThan(zoomFor(0));
  });

  it('clamps to the given min/max bounds', () => {
    const tiny = previewFitZoom({
      center,
      radius: 7,
      screenBiasX: 0,
      viewport: { width: 20, height: 20 },
      isSea: noSea,
      fallbackZoom: 0.6,
      minZoom: 0.3,
      maxZoom: 4,
    });
    expect(tiny).toBe(0.3);

    const huge = previewFitZoom({
      center,
      radius: 1,
      screenBiasX: 0,
      viewport: { width: 20000, height: 20000 },
      isSea: noSea,
      fallbackZoom: 0.6,
      minZoom: 0.05,
      maxZoom: 1.5,
    });
    expect(huge).toBe(1.5);
  });
});

// Design handoff "2a": the plot-pulse "look here" ripple (frames 1/1b) and
// the one-shot landfall burst (frame 2) — extracted as pure functions of
// wall-clock time so the animation's own maths is testable without a Pixi
// app, same reasoning as previewFitZoom/terrainTitleFor above.
describe('plotRippleFrames', () => {
  it('scale grows and alpha fades monotonically over one ring\'s cycle', () => {
    const start = plotRippleFrames(0)[0];
    const mid = plotRippleFrames(450)[0]; // a quarter into the 1800ms cycle
    const late = plotRippleFrames(1350)[0]; // three quarters in
    expect(start.scale).toBeCloseTo(0.45);
    expect(mid.scale).toBeGreaterThan(start.scale);
    expect(late.scale).toBeGreaterThan(mid.scale);
    expect(late.scale).toBeLessThanOrEqual(2.1);
    expect(start.alpha).toBeGreaterThan(mid.alpha);
    expect(mid.alpha).toBeGreaterThan(late.alpha);
  });

  it('loops back to the start of the cycle rather than growing forever', () => {
    const cycleStart = plotRippleFrames(0)[0];
    const oneCycleLater = plotRippleFrames(1800)[0];
    expect(oneCycleLater.scale).toBeCloseTo(cycleStart.scale);
    expect(oneCycleLater.alpha).toBeCloseTo(cycleStart.alpha);
  });

  it('offsets the second ring by half a cycle, so the two are never in phase', () => {
    const [ring0, ring1] = plotRippleFrames(0);
    expect(ring1.scale).not.toBeCloseTo(ring0.scale);
  });

  it('alpha never goes negative, even right at the end of a cycle', () => {
    for (const t of [0, 300, 900, 1799]) {
      for (const ring of plotRippleFrames(t)) {
        expect(ring.alpha).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('landfallBurstFrames', () => {
  it('is empty before the burst starts', () => {
    expect(landfallBurstFrames(999, 1000)).toEqual([]);
  });

  it('is empty once the whole moment has played out', () => {
    expect(landfallBurstFrames(1000 + 1900 + 550 + 1, 1000)).toEqual([]);
  });

  it('peaks partway through — scale up, alpha down — then is gone', () => {
    const startedAt = 1000;
    const atStart = landfallBurstFrames(startedAt, startedAt)[0];
    const midway = landfallBurstFrames(startedAt + 950, startedAt)[0];
    expect(atStart.scale).toBeCloseTo(0.25);
    expect(midway.scale).toBeGreaterThan(atStart.scale);
    expect(midway.scale).toBeLessThanOrEqual(3);
    expect(midway.alpha).toBeLessThan(atStart.alpha);
  });

  it('the second ring trails the first by its own offset, both self-clearing on schedule', () => {
    const startedAt = 1000;
    // Just past the first ring's own 1900ms window, but still inside the
    // second ring's (offset 550ms later) — exactly one frame should remain.
    const frames = landfallBurstFrames(startedAt + 1901, startedAt);
    expect(frames).toHaveLength(1);
  });
});

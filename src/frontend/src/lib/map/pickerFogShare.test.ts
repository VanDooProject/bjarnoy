// The send picker's framing refuses a camera move that shows more white mist than the view has now. What counts as
// mist has to be what the fog shader draws white: outside the loaded mask, and not inside any army's live reveal.
import { describe, expect, it } from 'vitest';
import { isDrawnClearOf } from './HexMapRenderer';
import { exploredShare } from './frameCamera';
import { isoGridPosition, isoPixelToAxial } from '../hex/geometry';
import { TILE_ART_TOPFACE_H_FRAC } from './textures';

const TILE_W = 168;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
// A loaded mask that marks only q < 0 explored.
const westExplored = { isExplored: (q: number) => q < 0 };
const nothingBeforeMask = () => false;

describe('isDrawnClearOf', () => {
  it('reads the loaded mask once there is one, not the client set', () => {
    expect(isDrawnClearOf(-3, 0, westExplored, () => false, [])).toBe(true);
    // Explored by the client (a far own settlement) but outside the loaded mask: drawn white.
    expect(isDrawnClearOf(30, 0, westExplored, () => true, [])).toBe(false);
  });

  it('counts the ground round an army as clear before the mask has caught up', () => {
    const army = [{ q: 20, r: 0, radius: 3 }];
    expect(isDrawnClearOf(22, 0, westExplored, nothingBeforeMask, army)).toBe(true);
    expect(isDrawnClearOf(24, 0, westExplored, nothingBeforeMask, army)).toBe(false);
  });

  it('falls back to the client set before the first mask arrives', () => {
    expect(isDrawnClearOf(5, 0, null, (q) => q === 5, [])).toBe(true);
    expect(isDrawnClearOf(6, 0, null, (q) => q === 5, [])).toBe(false);
  });
});

describe('exploredShare over the drawn fog', () => {
  const viewport = { width: 400, height: 800 };
  const clearAt = (armies: { q: number; r: number; radius: number }[]) => (x: number, y: number) => {
    const c = isoPixelToAxial({ x, y }, TILE_W, TILE_H);
    return isDrawnClearOf(c.q, c.r, westExplored, nothingBeforeMask, armies);
  };
  const centreOf = (q: number) => {
    const g = isoGridPosition({ q, r: 0 }, TILE_W, TILE_H);
    return { x: g.x + TILE_W / 2, y: g.y + TILE_H / 2 };
  };

  it('a view over the explored west beats one over the white east', () => {
    const west = { ...centreOf(-6), zoom: 1 };
    const east = { ...centreOf(12), zoom: 1 };
    expect(exploredShare(west, viewport, clearAt([]))).toBeGreaterThan(exploredShare(east, viewport, clearAt([])));
  });

  it('an army out in the white clears what it sees, so framing it is not scored as mist', () => {
    const east = { ...centreOf(12), zoom: 1 };
    expect(exploredShare(east, viewport, clearAt([{ q: 12, r: 0, radius: 4 }]))).toBeGreaterThan(
      exploredShare(east, viewport, clearAt([])),
    );
  });
});

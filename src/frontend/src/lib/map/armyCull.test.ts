// The terrain cull and an army's live fog reveal have to agree.
//
// Between mask fetches the fog shader clears a disc around every army in
// transit (fogShader.ts `armyRamps`). The terrain cull used to know only
// settlements and the server mask, so a marching army cleared the mist over
// ground that was never drawn and the bare canvas showed through: the 'edge of
// the world' next to the troops.
import { describe, expect, it } from 'vitest';
import {
  armyCullSourcesOf,
  isPastTerrainCullOf,
  type FogSource,
} from './HexMapRenderer';
import { armyFogClearReachHexes } from './fog/FogMaskLayer';
import { isoGridPosition } from '../hex/geometry';
import { hexDistance, type AxialCoord } from '../hex/coords';
import { TILE_ART_TOPFACE_H_FRAC } from './textures';

const TILE_W = 168;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
const allOpaque = { isOpaque: () => true };

function world(c: AxialCoord) {
  return isoGridPosition(c, TILE_W, TILE_H);
}

/** Every hex whose centre the shader's reveal reaches from a point `t` along the leg `from` → `to`. */
function revealedHexes(
  from: AxialCoord,
  to: AxialCoord,
  t: number,
  radiusHexes: number,
): AxialCoord[] {
  const a = world(from);
  const b = world(to);
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  // The fog's own metric: world offset over one hex step along each axis (HexMapRenderer's ARMY_HEX_SIZE).
  const reach = armyFogClearReachHexes(radiusHexes);
  const hx = (TILE_W * Math.sqrt(3)) / 2;
  const out: AxialCoord[] = [];
  for (let q = from.q - 20; q <= from.q + 20; q++) {
    for (let r = from.r - 20; r <= from.r + 20; r++) {
      const c = world({ q, r });
      if (Math.hypot((c.x - p.x) / hx, (c.y - p.y) / TILE_H) < reach) out.push({ q, r });
    }
  }
  return out;
}

describe('army terrain cull sources', () => {
  // Leg directions cover all six neighbours, so the squashed (TILE_H) axis is crossed both ways.
  const legs: [AxialCoord, AxialCoord][] = [
    [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ],
    [
      { q: 0, r: 0 },
      { q: 0, r: 1 },
    ],
    [
      { q: 0, r: 0 },
      { q: -1, r: 1 },
    ],
    [
      { q: 5, r: -3 },
      { q: 5, r: -4 },
    ],
  ];

  for (const radiusHexes of [2, 3, 4]) {
    it(`keeps every hex the reveal reaches drawn (radius ${radiusHexes})`, () => {
      for (const [from, to] of legs) {
        const sources = armyCullSourcesOf([[from, to]], radiusHexes);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          for (const hex of revealedHexes(from, to, t, radiusHexes)) {
            expect(
              isPastTerrainCullOf(hex.q, hex.r, [], allOpaque, sources),
              `${hex.q},${hex.r} at t=${t}`,
            ).toBe(false);
          }
        }
      }
    });
  }

  it('culls a hex under opaque mist without an army, keeps it with one', () => {
    const army = armyCullSourcesOf(
      [
        [
          { q: 40, r: 0 },
          { q: 41, r: 0 },
        ],
      ],
      2,
    );
    const settlement: FogSource[] = [{ q: 0, r: 0, radius: 5 }];
    expect(isPastTerrainCullOf(42, 0, settlement, allOpaque)).toBe(true);
    expect(isPastTerrainCullOf(42, 0, settlement, allOpaque, army)).toBe(false);
  });

  it('still culls far from every army', () => {
    const army = armyCullSourcesOf(
      [
        [
          { q: 40, r: 0 },
          { q: 41, r: 0 },
        ],
      ],
      2,
    );
    expect(isPastTerrainCullOf(80, 0, [], allOpaque, army)).toBe(true);
  });

  it('shares hexes between armies on one road', () => {
    const sources = armyCullSourcesOf(
      [
        [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
        [
          { q: 1, r: 0 },
          { q: 2, r: 0 },
        ],
      ],
      2,
    );
    expect(sources.map((s) => `${s.q},${s.r}`)).toEqual(['0,0', '1,0', '2,0']);
    expect(hexDistance(sources[0], sources[2])).toBe(2);
  });
});

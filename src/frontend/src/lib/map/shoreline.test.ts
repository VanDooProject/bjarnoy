import { describe, expect, it } from 'vitest';
import { claimRadiusForLevel, hasShoreline, type TerrainLookup } from './shoreline';

// A tiny fake terrain: sea everywhere except the coordinates listed as land.
function landAt(coords: Array<{ q: number; r: number }>): TerrainLookup {
  const key = (q: number, r: number) => `${q},${r}`;
  const land = new Set(coords.map((c) => key(c.q, c.r)));
  return { isLand: (q, r) => land.has(key(q, r)) };
}

describe('hasShoreline', () => {
  it('is false for a settlement whose whole claim is inland (no sea neighbour anywhere)', () => {
    // A 3x3-ish patch of land, claim radius 1 around the centre — every
    // claimed hex's neighbours are also land.
    const coords = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 1 },
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: -1, r: 1 },
      { q: 2, r: 0 },
      { q: -2, r: 0 },
      { q: 0, r: 2 },
      { q: 0, r: -2 },
      { q: 2, r: -1 },
      { q: -2, r: 1 },
      { q: 1, r: 1 },
      { q: -1, r: -1 },
      { q: 2, r: -2 },
      { q: -2, r: 2 },
      { q: 1, r: -2 },
      { q: -1, r: 2 },
    ];
    const terrain = landAt(coords);
    expect(hasShoreline({ q: 0, r: 0 }, 1, terrain)).toBe(false);
  });

  it('is true when a claimed land hex borders a sea hex', () => {
    // Only the centre is land; every neighbour (and everything else) is sea.
    const terrain = landAt([{ q: 0, r: 0 }]);
    expect(hasShoreline({ q: 0, r: 0 }, 1, terrain)).toBe(true);
  });

  it('credits a land hex bordering an enclosed sea lagoon, not the lagoon itself', () => {
    // A lagoon: (0,0) is sea, every neighbour is land — those land hexes are
    // themselves a shoreline (they border sea), even though the sea hex they
    // border is fully enclosed rather than the open ocean.
    const ring = neighborsOf({ q: 0, r: 0 });
    const terrain = landAt(ring);
    expect(hasShoreline({ q: 0, r: 0 }, 1, terrain)).toBe(true);
    // But claiming only the lagoon itself (radius 0, all sea) finds nothing.
    expect(hasShoreline({ q: 0, r: 0 }, 0, terrain)).toBe(false);
  });

  it('only checks hexes within claimRadius — a sea hex reachable only from outside the claim does not count', () => {
    // Land everywhere except one sea hex two rings straight out from the
    // centre, so no radius-1 claimed hex has it as a direct neighbour.
    const terrain: TerrainLookup = { isLand: (q, r) => !(q === 3 && r === 0) };
    expect(hasShoreline({ q: 0, r: 0 }, 1, terrain)).toBe(false);
    // At radius 2, the claim includes (2,0), whose neighbour (3,0) is sea.
    expect(hasShoreline({ q: 0, r: 0 }, 2, terrain)).toBe(true);
  });
});

describe('claimRadiusForLevel', () => {
  it('mirrors Settlement.cs\'s 1 + (LonghouseLevel / 2), integer division', () => {
    expect(claimRadiusForLevel(1)).toBe(1);
    expect(claimRadiusForLevel(2)).toBe(2);
    expect(claimRadiusForLevel(3)).toBe(2);
    expect(claimRadiusForLevel(4)).toBe(3);
    expect(claimRadiusForLevel(10)).toBe(6);
  });
});

function neighborsOf(c: { q: number; r: number }) {
  const dirs = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return dirs.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

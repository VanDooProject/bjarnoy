import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import {
  BOAT_CHANCE,
  FISHING_HUT_PROP_REACH,
  lakeBoatLimit,
  ORE_WORKS_PROP_REACH,
  placeLakeProps,
  PROP_MIN_SPACING,
  type LakePropBuilding,
} from './lakeProps';

const disc = (centre: AxialCoord, radius: number) => hexesInRadius(centre, radius);

/** A ring of hexes at exactly `distance` from `centre`, as the shore buildings of a lake. */
function shoreOf(centre: AxialCoord, radius: number): AxialCoord[] {
  return hexesInRadius(centre, radius + 1).filter((c) => hexDistance(c, centre) === radius + 1);
}

describe('lakeBoatLimit', () => {
  it.each([
    [1, 1],
    [7, 1],
    [23, 1],
    [24, 2],
    [37, 3],
    [61, 5],
    [176, 14],
  ])('a lake of %i open-water hexes holds %i boat(s) at most', (tiles, limit) => {
    expect(lakeBoatLimit(tiles)).toBe(limit);
  });
});

describe('placeLakeProps', () => {
  const seed = 20260930;

  it('places nothing without buildings or without a lake', () => {
    expect(placeLakeProps(seed, disc({ q: 0, r: 0 }, 2), []).size).toBe(0);
    expect(placeLakeProps(seed, [], [{ q: 1, r: 1, type: 'fishinghut' }]).size).toBe(0);
  });

  it('is deterministic, and independent of the order the buildings are handed over in', () => {
    const lake = disc({ q: 0, r: 0 }, 4);
    const huts: LakePropBuilding[] = shoreOf({ q: 0, r: 0 }, 4).map((c) => ({ ...c, type: 'fishinghut' }));
    const first = placeLakeProps(seed, lake, huts);
    const second = placeLakeProps(seed, [...lake].reverse(), [...huts].reverse());
    expect([...second].sort()).toEqual([...first].sort());
    expect(first.size).toBeGreaterThan(0);
  });

  it('depends on the world seed', () => {
    const lake = disc({ q: 0, r: 0 }, 4);
    const huts: LakePropBuilding[] = shoreOf({ q: 0, r: 0 }, 4).map((c) => ({ ...c, type: 'fishinghut' }));
    const seen = new Set(
      [1, 2, 3, 4, 5, 6].map((s) =>
        [...placeLakeProps(s, lake, huts)]
          .map(([k, v]) => `${k}:${v}`)
          .sort()
          .join('|'),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('puts a prop only on an open-lake hex within reach of the building that asked for it', () => {
    const lake = disc({ q: 0, r: 0 }, 5);
    const lakeKeys = new Set(lake.map(coordKey));
    const buildings: LakePropBuilding[] = [
      { q: 6, r: 0, type: 'fishinghut' },
      { q: -6, r: 0, type: 'bogoreworks' },
      { q: 0, r: 6, type: 'fishinghut' },
      { q: 0, r: -6, type: 'bogoreworks' },
    ];
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const props = placeLakeProps(s, lake, buildings);
      for (const [key] of props) {
        expect(lakeKeys.has(key)).toBe(true);
        const [q, r] = key.split(',').map(Number) as [number, number];
        const nearest = Math.min(
          ...buildings.map((b) => hexDistance({ q, r }, b) - (b.type === 'fishinghut' ? FISHING_HUT_PROP_REACH : ORE_WORKS_PROP_REACH)),
        );
        expect(nearest).toBeLessThanOrEqual(0);
      }
    }
  });

  it('gives the weir and the fishing boat to fishing huts only, and the ore boat to bog-ore works only', () => {
    const lake = disc({ q: 0, r: 0 }, 6);
    const huts = shoreOf({ q: 0, r: 0 }, 6).filter((_, i) => i % 3 === 0);
    const hutOnly = placeLakeProps(seed, lake, huts.map((c) => ({ ...c, type: 'fishinghut' as const })));
    const worksOnly = placeLakeProps(seed, lake, huts.map((c) => ({ ...c, type: 'bogoreworks' as const })));
    expect([...hutOnly.values()].every((p) => p === 'weir' || p === 'fishboat')).toBe(true);
    expect([...worksOnly.values()].every((p) => p === 'oreboat')).toBe(true);
    expect(hutOnly.size).toBeGreaterThan(0);
    expect(worksOnly.size).toBeGreaterThan(0);
  });

  it('never puts boats or weirs closer than the minimum spacing', () => {
    const lake = disc({ q: 0, r: 0 }, 6);
    const buildings: LakePropBuilding[] = shoreOf({ q: 0, r: 0 }, 6).map((c, i) => ({ ...c, type: i % 2 ? 'fishinghut' : 'bogoreworks' }));
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const tiles = [...placeLakeProps(s, lake, buildings).keys()].map((k) => {
        const [q, r] = k.split(',').map(Number) as [number, number];
        return { q, r };
      });
      for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
          expect(hexDistance(tiles[i]!, tiles[j]!)).toBeGreaterThanOrEqual(PROP_MIN_SPACING);
        }
      }
    }
  });

  it('holds at most one boat on a small lake however many buildings stand around it', () => {
    const lake = disc({ q: 0, r: 0 }, 2); // 19 hexes: floor(19 / 12) = 1
    const buildings: LakePropBuilding[] = hexesInRadius({ q: 0, r: 0 }, 5)
      .filter((c) => hexDistance(c, { q: 0, r: 0 }) >= 3)
      .map((c) => ({ ...c, type: 'bogoreworks' as const }));
    let sawOne = false;
    for (let s = 1; s <= 40; s++) {
      const boats = [...placeLakeProps(s, lake, buildings).values()].filter((p) => p !== 'weir');
      expect(boats.length).toBeLessThanOrEqual(1);
      if (boats.length === 1) sawOne = true;
    }
    expect(sawOne).toBe(true);
  });

  it('lets a big lake hold several boats, but never more than its limit', () => {
    const radius = 5; // 91 hexes: floor(91 / 12) = 7
    const lake = disc({ q: 0, r: 0 }, radius);
    const buildings: LakePropBuilding[] = hexesInRadius({ q: 0, r: 0 }, radius + 3)
      .filter((c) => hexDistance(c, { q: 0, r: 0 }) > radius)
      .map((c) => ({ ...c, type: 'bogoreworks' as const }));
    let most = 0;
    for (let s = 1; s <= 20; s++) {
      const boats = [...placeLakeProps(s, lake, buildings).values()].filter((p) => p !== 'weir').length;
      expect(boats).toBeLessThanOrEqual(lakeBoatLimit(lake.length));
      most = Math.max(most, boats);
    }
    expect(most).toBeGreaterThan(1);
  });

  it('does not count a weir against the boat limit of a lake', () => {
    // A 15-hex strip of water holds one boat at most (floor(15 / 12) = 1); a hut on its shore can still get its weir on top.
    const lake = Array.from({ length: 15 }, (_, q) => ({ q, r: 0 }));
    expect(lakeBoatLimit(lake.length)).toBe(1);
    let both = false;
    for (let s = 1; s <= 400 && !both; s++) {
      const props = [...placeLakeProps(s, lake, [{ q: 7, r: 1, type: 'fishinghut' }]).values()];
      both = props.includes('weir') && props.includes('fishboat');
    }
    expect(both).toBe(true);
  });

  it('gives roughly BOAT_CHANCE of the qualifying buildings a prop, before the density limits', () => {
    // Many separate lakes with one building each: nothing but the roll can drop a prop.
    let asked = 0;
    let got = 0;
    for (let i = 0; i < 400; i++) {
      const centre = { q: i * 20, r: 0 };
      const props = placeLakeProps(seed, disc(centre, 2), [{ q: centre.q + 3, r: 0, type: 'bogoreworks' }]);
      asked++;
      got += props.size;
    }
    expect(got / asked).toBeGreaterThan(BOAT_CHANCE - 0.12);
    expect(got / asked).toBeLessThan(BOAT_CHANCE + 0.12);
  });

  it('ignores a building with no open water in reach', () => {
    const lake = disc({ q: 0, r: 0 }, 2);
    for (let s = 1; s <= 30; s++) {
      expect(placeLakeProps(s, lake, [{ q: 10, r: 0, type: 'bogoreworks' }]).size).toBe(0);
      // a hut two hexes past the reach of the lake edge
      expect(placeLakeProps(s, lake, [{ q: 2 + FISHING_HUT_PROP_REACH + 1, r: 0, type: 'fishinghut' }]).size).toBe(0);
    }
  });
});

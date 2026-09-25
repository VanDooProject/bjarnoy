// Guards the Wasted Lands docs page's "turning island" data (WastedIsland.vue
// renders whatever this produces): every generated frame name must be a real
// atlas frame in its own placement's category (so an art-pack rename shows
// up here, not as a blank tile on the docs page), the two giants must draw as
// 7 per-hex ground-plate bases + 7 per-hex top parts each (mirroring the
// in-game map, not one pre-composited showcase frame whose own ground
// plates' dirt skirts would overdraw neighbouring hexes), and the "never put
// a tall tile in front of Utgard" rule must hold for every one of the six
// rotations the page's rotate buttons can reach.
import { describe, expect, it } from 'vitest';
import { buildIsland, resolvesDirectly } from './wastedIsland';
import { coordKey, hexDistance } from '../hex/coords';
import { GIANT_NEIGHBOR_PARTS, type GiantPart } from '../map/giantTiles';

const ORIGIN = { q: 0, r: 0 };
const ROTATIONS = [0, 1, 2, 3, 4, 5];
const GIANT_KINDS = ['utgard', 'volcano'] as const;
const ALL_PARTS: GiantPart[] = ['C', ...GIANT_NEIGHBOR_PARTS];

describe('buildIsland', () => {
  for (const rotation of ROTATIONS) {
    describe(`rotation ${rotation}`, () => {
      const placements = buildIsland(rotation);

      it('resolves every living and wasted frame in its own category without the fallback chain', () => {
        for (const p of placements) {
          expect(
            resolvesDirectly(p.livingFrame, p.category),
            `${p.key} living "${p.livingFrame}" in "${p.category}"`,
          ).toBe(true);
          expect(
            resolvesDirectly(p.wastedFrame, p.category),
            `${p.key} wasted "${p.wastedFrame}" in "${p.category}"`,
          ).toBe(true);
        }
      });

      it('draws each giant as 7 per-hex bases + 7 per-hex top parts, not one composite', () => {
        for (const kind of GIANT_KINDS) {
          const giant = placements.filter((p) => p.kind === kind);
          expect(giant).toHaveLength(14);

          const bases = giant.filter((p) => p.layer === 'base');
          const tops = giant.filter((p) => p.layer === 'top');
          expect(bases).toHaveLength(7);
          expect(tops).toHaveLength(7);

          // Every placement of the giant is single-hex, and covers all six
          // hexes around its centre plus the centre itself, with no hex
          // repeated within a layer.
          for (const p of giant) expect(p.hexes).toHaveLength(1);

          for (const layer of [bases, tops]) {
            const seen = new Set<string>();
            for (const p of layer) {
              const k = `${p.hexes[0]!.q},${p.hexes[0]!.r}`;
              expect(seen.has(k), `${p.key} hex ${k} repeated`).toBe(false);
              seen.add(k);
            }
            expect(seen.size).toBe(7);
          }

          // A giant's per-hex top part's frame name carries a `<DIR>` suffix
          // (`_partC`/`_partN`/...) — every one of the seven directions
          // shows up exactly once.
          const dirs = tops.map((p) => /_part(C|N|NE|SE|S|SW|NW)$/.exec(p.livingFrame)?.[1]).sort();
          expect(dirs).toEqual([...ALL_PARTS].sort());

          // Bases are plain ground tiles: no `_part`/`_level` suffix.
          for (const p of bases) {
            expect(p.livingFrame).not.toMatch(/_part|_level/);
            expect(p.wastedFrame).not.toMatch(/_part|_level/);
          }

          // Both layers of one giant cross-fade together.
          const turnsAt = new Set(giant.map((p) => p.turnsAt));
          expect(turnsAt.size).toBe(1);

          // Hovering any hex of the giant highlights the whole footprint
          // and shows one caption identity: every one of its 14 placements
          // shares one hoverGroup.
          const hoverGroups = new Set(giant.map((p) => p.hoverGroup));
          expect(hoverGroups.size).toBe(1);
        }
      });

      it('covers no hex with two ground/land placements', () => {
        // A "ground" placement is one that occupies the hex's terrain
        // itself: every ordinary tile (a single pre-composited base+top
        // frame, "top" layer) and every giant's own per-hex ground plate
        // ("base" layer). A giant's top *part* deliberately shares its hex
        // with that hex's own ground plate (a building standing on ground,
        // not two pieces of ground), so it's excluded here.
        const isGround = (p: (typeof placements)[number]) =>
          p.layer === 'base' || (p.kind !== 'utgard' && p.kind !== 'volcano');
        const seen = new Set<string>();
        for (const p of placements.filter(isGround)) {
          for (const h of p.hexes) {
            const key = `${h.q},${h.r}`;
            expect(seen.has(key), `hex ${key} covered by two ground placements`).toBe(false);
            seen.add(key);
          }
        }
      });

      it('never places forest/mountain immediately around the Utgard flower', () => {
        // The ring at hex-distance 2 from Utgard's centre (origin, fixed under
        // rotation) is exactly the ring adjacent to the 7-hex flower — over the
        // full 0..5 rotation sweep every hex in it ends up "south of Utgard" at
        // some rotation, so none of them may ever carry a tall sprite.
        for (const p of placements) {
          if (p.kind !== 'forest' && p.kind !== 'mountain') continue;
          for (const h of p.hexes) {
            expect(hexDistance(h, ORIGIN)).not.toBe(2);
          }
        }
      });

      it('stands both wasted giants on wasteland ground', () => {
        const giantBases = placements.filter((p) => p.layer === 'base');
        expect(giantBases).toHaveLength(14);
        for (const p of giantBases) expect(p.wastedFrame).toMatch(/^wasteland_(E|NE|NW|W|SW|SE)$/);
        const volcanoTops = placements.filter((p) => p.kind === 'volcano' && p.layer === 'top');
        for (const p of volcanoTops) expect(p.wastedFrame).toMatch(/^giantvolcano_wasted_/);
      });

      it("draws in one depth-sorted pass, a giant's plate before its own top part", () => {
        for (let i = 1; i < placements.length; i++) {
          expect(placements[i]!.depth).toBeGreaterThanOrEqual(placements[i - 1]!.depth);
        }
        const indexOf = (layer: 'base' | 'top', h: { q: number; r: number }) =>
          placements.findIndex(
            (p) =>
              p.layer === layer &&
              (p.kind === 'utgard' || p.kind === 'volcano') &&
              coordKey(p.hexes[0]!) === coordKey(h),
          );
        for (const p of placements.filter((x) => x.layer === 'base')) {
          expect(indexOf('base', p.hexes[0]!)).toBeLessThan(indexOf('top', p.hexes[0]!));
        }
      });

      // Regression: drawing every giant ground plate first let the tiles
      // behind a giant paint their dirt side skirts over its plates.
      it('draws every ordinary tile behind a giant plate before that plate', () => {
        for (const [i, base] of placements.entries()) {
          if (base.layer !== 'base') continue;
          for (const [j, other] of placements.entries()) {
            if (other.layer !== 'top' || other.kind === 'utgard' || other.kind === 'volcano') continue;
            if (other.depth < base.depth && hexDistance(other.hexes[0]!, base.hexes[0]!) === 1) {
              expect(j).toBeLessThan(i);
            }
          }
        }
      });

      it('has turnsAt within 1..4', () => {
        for (const p of placements) {
          expect(p.turnsAt).toBeGreaterThanOrEqual(1);
          expect(p.turnsAt).toBeLessThanOrEqual(4);
        }
      });
    });
  }

  it('turnsAt is monotone with ring: flower(1) <= land/volcano(2) <= coast(3) <= sea(4)', () => {
    const placements = buildIsland(0);
    const byKind = new Map<string, number>();
    for (const p of placements) {
      if (p.kind === 'utgard' || p.kind === 'volcano') byKind.set(p.kind, p.turnsAt);
    }
    expect(byKind.get('utgard')).toBe(1);
    expect(byKind.get('volcano')).toBe(2);
    for (const p of placements) {
      if (p.kind === 'grass' || p.kind === 'forest' || p.kind === 'mountain' || p.kind === 'sand') {
        expect(p.turnsAt).toBe(2);
      } else if (p.kind === 'coast') {
        expect(p.turnsAt).toBe(3);
      } else if (p.kind === 'sea') {
        expect(p.turnsAt).toBe(4);
      }
    }
  });

  it('produces a stable, rotation-independent set of placement keys', () => {
    const keys0 = new Set(buildIsland(0).map((p) => p.key));
    const keys3 = new Set(buildIsland(3).map((p) => p.key));
    expect(keys3).toEqual(keys0);
  });
});

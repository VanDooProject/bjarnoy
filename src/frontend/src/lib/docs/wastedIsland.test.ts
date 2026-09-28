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
import {
  buildIsland,
  buildIslandTiles,
  delayFraction,
  islandHexInfo,
  islandHexRecordsForTests,
  resolvesDirectly,
  resolveIslandClip,
  resolveIslandFrame,
  rotateAxial,
  giantFamilyHasClip,
  giantClipBoxes,
  giantTopPartBox,
  GIANT_PART_NATIVE_CANVAS_H,
} from './wastedIsland';
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

// The turning island's giant top parts play a `buildings-anim` clip when one
// exists for that family/orientation/part (living Utgard, i.e. `giantshrine`,
// and the wasted volcano, i.e. `giantvolcano_wasted`) and otherwise keep
// their static frame (`giantutgard`, the wasted Utgard family, has none).
describe('giant top-part clips', () => {
  const placements0 = buildIsland(0);

  it('resolves a clip with more than one frame for every part of the living Utgard flower at SE', () => {
    const utgardTops = placements0.filter((p) => p.kind === 'utgard' && p.layer === 'top');
    expect(utgardTops).toHaveLength(7);
    for (const p of utgardTops) {
      const clip = resolveIslandClip(p.livingFrame);
      expect(clip, `${p.livingFrame}`).toBeDefined();
      expect(clip!.frameRects.length).toBeGreaterThan(1);
    }
  });

  it('resolves a clip with more than one frame for every part of the wasted volcano at SE', () => {
    const volcanoTops = placements0.filter((p) => p.kind === 'volcano' && p.layer === 'top');
    expect(volcanoTops).toHaveLength(7);
    for (const p of volcanoTops) {
      const clip = resolveIslandClip(p.wastedFrame);
      expect(clip, `${p.wastedFrame}`).toBeDefined();
      expect(clip!.frameRects.length).toBeGreaterThan(1);
    }
  });

  it('falls back to the static frame for a family with no clip (wasted Utgard, living volcano)', () => {
    const utgardTops = placements0.filter((p) => p.kind === 'utgard' && p.layer === 'top');
    for (const p of utgardTops) {
      expect(resolveIslandClip(p.wastedFrame)).toBeUndefined();
      // The static fallback still resolves — the whole point of degrading
      // gracefully rather than leaving a blank tile.
      expect(resolvesDirectly(p.wastedFrame, p.category)).toBe(true);
    }
    const volcanoTops = placements0.filter((p) => p.kind === 'volcano' && p.layer === 'top');
    for (const p of volcanoTops) {
      expect(resolveIslandClip(p.livingFrame)).toBeUndefined();
      expect(resolvesDirectly(p.livingFrame, p.category)).toBe(true);
    }
  });

  it('giantFamilyHasClip agrees: true for the animated families, false for the static ones', () => {
    expect(giantFamilyHasClip('giantshrine', 'SE')).toBe(true);
    expect(giantFamilyHasClip('giantvolcano_wasted', 'SE')).toBe(true);
    expect(giantFamilyHasClip('giantutgard', 'SE')).toBe(false);
    expect(giantFamilyHasClip('giantmountain', 'SE')).toBe(false);
  });

  // Regression: clip frames used to be drawn into the static frame's box,
  // but each frame is trimmed on its own — the wasted volcano's centre frames
  // are ~255px tall against a 393px static frame, so the lava/smoke got
  // stretched down over the cone ("the middle of the volcano looks too low").
  it('gives every clip frame its own untrimmed-canvas box instead of the static frame\'s', () => {
    const centre = placements0.find((p) => p.kind === 'volcano' && p.layer === 'top' && p.wastedFrame.endsWith('partC'))!;
    const clip = resolveIslandClip(centre.wastedFrame)!;
    const staticRect = resolveIslandFrame(centre.wastedFrame, centre.category)!;
    const origin = { x: centre.x, y: centre.y };
    const staticBox = giantTopPartBox(origin, staticRect);
    const boxes = giantClipBoxes(origin, clip);

    expect(boxes.frames).toHaveLength(clip.frameRects.length);
    clip.frameRects.forEach((rect, i) => {
      const box = boxes.frames[i]!;
      // Drawn at the part's 2x scale without stretching...
      expect(box.width).toBe(2 * rect.frame.w);
      expect(box.height).toBe(2 * rect.frame.h);
      // ...at the spot its own trim puts it on the part's canvas, which
      // shares its bottom edge with the static frame's canvas.
      const canvasTop = staticBox.top - 2 * staticRect.spriteSourceSize.y;
      expect(box.top - canvasTop).toBe(2 * rect.spriteSourceSize.y);
      expect(2 * (GIANT_PART_NATIVE_CANVAS_H - rect.sourceSize.h)).toBe(2 * (GIANT_PART_NATIVE_CANVAS_H - staticRect.sourceSize.h));
    });
    // The case that broke: at least one frame is trimmed differently from
    // the static frame, so reusing its box would have stretched it.
    expect(boxes.frames.some((b) => b.height !== staticBox.height || b.top !== staticBox.top)).toBe(true);
  });
});

// buildIslandTiles is what WastedIsland.vue actually feeds the real
// HexMapRenderer (via StaticWorldModel) — everything below cross-checks it
// against buildIsland's own frame-name classification instead of asserting
// its own numbers, so the two can never quietly disagree about which hex is
// which kind, which giant covers what, or which art variant to show.
describe('buildIslandTiles', () => {
  const recordsByCoord = new Map(islandHexRecordsForTests().map((r) => [coordKey({ q: r.q, r: r.r }), r]));

  for (const rotation of ROTATIONS) {
    describe(`rotation ${rotation}`, () => {
      const domPlacements = buildIsland(rotation);
      const ordinaryTops = domPlacements.filter((p) => p.layer === 'top' && p.kind !== 'utgard' && p.kind !== 'volcano');

      it('has the same hex set as buildIsland, one Tile per ordinary hex plus 14 per giant', () => {
        const tiles = buildIslandTiles(rotation, 0);
        const ordinaryKeys = new Set(ordinaryTops.map((p) => coordKey(p.hexes[0]!)));
        const giantKeys = new Set(
          domPlacements.filter((p) => p.kind === 'utgard' || p.kind === 'volcano').map((p) => coordKey(p.hexes[0]!)),
        );
        // Every ordinary DOM tile has exactly one Tile at its hex, and every
        // giant hex has exactly two (a base-layer terrain tile is never
        // emitted separately for a giant hex — its `Tile.giant` field covers
        // both the ground and the top part in one entry).
        const tileKeys = tiles.map((t) => coordKey(t));
        const counts = new Map<string, number>();
        for (const k of tileKeys) counts.set(k, (counts.get(k) ?? 0) + 1);
        for (const key of ordinaryKeys) expect(counts.get(key)).toBe(1);
        for (const key of giantKeys) expect(counts.get(key)).toBe(1);
        expect(tiles).toHaveLength(ordinaryKeys.size + giantKeys.size);
      });

      it("uses each hex's own living/wasted variant index, at both ends of the blight", () => {
        const living = new Map(buildIslandTiles(rotation, 0).map((t) => [coordKey(t), t]));
        const wasted = new Map(buildIslandTiles(rotation, 4).map((t) => [coordKey(t), t]));
        for (const p of ordinaryTops) {
          const rotatedKey = coordKey(p.hexes[0]!);
          const original = rotateAxial(p.hexes[0]!, -rotation);
          const record = recordsByCoord.get(coordKey(original))!;
          expect(living.get(rotatedKey)!.variant ?? 0).toBe(record.livingVariantIndex);
          expect(wasted.get(rotatedKey)!.variant ?? 0).toBe(record.wastedVariantIndex);
        }
      });

      it('only the coast ring is coastal water; the open-sea ring is plain sea', () => {
        const tiles = buildIslandTiles(rotation, 0);
        for (const p of ordinaryTops) {
          if (p.kind !== 'coast' && p.kind !== 'sea') continue;
          const t = tiles.find((x) => coordKey(x) === coordKey(p.hexes[0]!))!;
          expect(t.terrain).toBe('sea');
          expect(!!t.isCoastalWater).toBe(p.kind === 'coast');
        }
        // Both rings actually exist on this island (regression: a change
        // that accidentally makes every water hex "coast" would still pass
        // the per-hex check above with a vacuous open-sea case).
        expect(ordinaryTops.some((p) => p.kind === 'coast')).toBe(true);
        expect(ordinaryTops.some((p) => p.kind === 'sea')).toBe(true);
      });

      it('wasted follows the stage threshold at every hex, ordinary and giant alike', () => {
        for (const stage of [0, 1, 2, 3, 4]) {
          for (const t of buildIslandTiles(rotation, stage)) {
            const info = islandHexInfo(rotation, t)!;
            expect(t.wasted).toBe(stage >= info.turnsAt);
          }
        }
      });

      it('gives each giant its 7 covered hexes, with the right living/wasted family and a fixed orientation', () => {
        for (const [kind, living, wastedFamily, turnsAt] of [
          ['utgard', 'giantshrine', 'giantutgard', 1],
          ['volcano', 'giantmountain', 'giantvolcano', 2],
        ] as const) {
          const livingTiles = buildIslandTiles(rotation, 0).filter((t) => t.giant && domGiantKindOf(t, domPlacements) === kind);
          const wastedTiles = buildIslandTiles(rotation, 4).filter((t) => t.giant && domGiantKindOf(t, domPlacements) === kind);
          expect(livingTiles).toHaveLength(7);
          expect(wastedTiles).toHaveLength(7);

          const anchor = livingTiles[0]!.giant!.anchor;
          const parts = new Set<string>();
          for (const t of livingTiles) {
            expect(t.terrain).toBe('grass');
            expect(t.giant!.family).toBe(living);
            expect(t.giant!.anchor).toEqual(anchor);
            expect(t.wasted).toBe(false);
            parts.add(t.giant!.part);
          }
          expect(parts).toEqual(new Set(['C', ...GIANT_NEIGHBOR_PARTS]));

          for (const t of wastedTiles) {
            expect(t.giant!.family).toBe(wastedFamily);
            expect(t.wasted).toBe(true);
          }
          expect(turnsAt).toBe(kind === 'utgard' ? 1 : 2);
        }
      });
    });
  }

  it('produces the same hex set as buildIsland across every rotation (stable under rotation)', () => {
    for (const rotation of ROTATIONS) {
      const fromTiles = new Set(buildIslandTiles(rotation, 0).map((t) => coordKey(t)));
      const fromDom = new Set(buildIsland(rotation).map((p) => coordKey(p.hexes[0]!)));
      expect(fromTiles).toEqual(fromDom);
    }
  });

  it('delayFraction mirrors buildIsland\'s own placement.delay, and is 0 for a giant hex', () => {
    const rotation = 2;
    const placements = buildIsland(rotation);
    for (const p of placements) {
      if (p.layer === 'base') continue; // giant ground plates duplicate the hex their top part already covers
      expect(delayFraction(rotation, p.hexes[0]!)).toBeCloseTo(p.kind === 'utgard' || p.kind === 'volcano' ? 0 : p.delay);
    }
  });

  it('islandHexInfo is undefined off the island', () => {
    expect(islandHexInfo(0, { q: 1000, r: 1000 })).toBeUndefined();
    expect(delayFraction(0, { q: 1000, r: 1000 })).toBe(0);
  });
});

// A Tile's own `giant.family` distinguishes utgard from volcano only while
// living (both flip to a different family once wasted) — this instead tells
// the two apart by anchor, cross-referencing buildIsland's DOM placements
// (which key giant hexes by `kind`, `"utgard"`/`"volcano"`, directly) at the
// anchor hex, which every giant's DOM placement set always includes.
function domGiantKindOf(
  t: { giant?: { anchor: { q: number; r: number } } },
  domPlacements: ReturnType<typeof buildIsland>,
): 'utgard' | 'volcano' | undefined {
  if (!t.giant) return undefined;
  const anchorKey = coordKey(t.giant.anchor);
  const anchorPlacement = domPlacements.find(
    (p) => (p.kind === 'utgard' || p.kind === 'volcano') && coordKey(p.hexes[0]!) === anchorKey,
  );
  return anchorPlacement?.kind as 'utgard' | 'volcano' | undefined;
}

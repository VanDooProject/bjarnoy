import { describe, expect, it } from 'vitest';
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import {
  LAND_EXAMPLE_BRIDGE,
  LAND_EXAMPLE_END,
  LAND_EXAMPLE_GATE,
  LAND_EXAMPLE_RIVERS,
  LAND_EXAMPLE_SETTLEMENT,
  LAND_EXAMPLE_START,
  buildLandExampleTiles,
  landExampleContext,
  landExampleRoute,
} from './landMovementExample';
import { findPath, pathCost } from '../map/hexPath';
import { canPlacePalisade, type WallSet } from '../map/palisadeTiles';
import { TILE_ORIENTATIONS, confluenceKind } from '../map/types';

describe('the land movement example island', () => {
  const tiles = buildLandExampleTiles();
  const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
  const tileAt = (c: AxialCoord) => byKey.get(coordKey(c));
  const terrainAt = (c: AxialCoord) => tileAt(c)?.terrain ?? 'sea';
  const riverAt = new Map(LAND_EXAMPLE_RIVERS.map((r) => [coordKey(r), r]));
  const ctx = landExampleContext(tiles);
  const route = landExampleRoute(tiles);
  const onPath = new Set(route.path.map(coordKey));
  const step = (c: AxialCoord, dir: string) => neighbors(c)[TILE_ORIENTATIONS.indexOf(dir as never)]!;

  describe('keeps to the world rules', () => {
    it('has sand on the coast: no grass hex touches the sea', () => {
      const land = tiles.filter((t) => t.terrain !== 'sea');
      const coastalGrass = land.filter((t) => t.terrain === 'grass' && neighbors(t).some((n) => terrainAt(n) === 'sea'));
      expect(coastalGrass.map(coordKey)).toEqual([]);
      expect(land.filter((t) => t.terrain === 'sand').length).toBeGreaterThan(10);
    });

    it('starts every watercourse as a stream at a spring under the mountains', () => {
      const springs = LAND_EXAMPLE_RIVERS.filter((r) => r.shape === 'spring');
      expect(springs).toHaveLength(3);
      for (const s of springs) {
        expect(s.width).toBe('stream');
        expect(neighbors(s).some((n) => terrainAt(n) === 'mountain')).toBe(true);
      }
    });

    it('links every river hex to its neighbours both ways and only ever flows over land', () => {
      for (const r of LAND_EXAMPLE_RIVERS) {
        expect(terrainAt(r)).not.toBe('sea');
        if (r.outDirection) {
          const down = riverAt.get(coordKey(step(r, r.outDirection)));
          expect(down, `${coordKey(r)} flows out into a river hex`).toBeDefined();
          const back = down!.inDirections.map((d) => coordKey(step(down!, d)));
          expect(back).toContain(coordKey(r));
        }
      }
    });

    it('widens where the two streams meet and joins the third at the river-stream Y', () => {
      const confluences = LAND_EXAMPLE_RIVERS.filter((r) => r.shape === 'confluence');
      expect(confluences.map((c) => c.width).sort()).toEqual(['riverstream', 'widen']);
      for (const c of confluences) {
        const [a, b] = c.inDirections.map((d) => TILE_ORIENTATIONS.indexOf(d));
        expect(confluenceKind(a!, b!, TILE_ORIENTATIONS.indexOf(c.outDirection!))).not.toBeNull();
      }
    });

    it('reaches the sea at a river-width mouth facing open water', () => {
      const mouths = LAND_EXAMPLE_RIVERS.filter((r) => r.shape === 'mouth');
      expect(mouths).toHaveLength(1);
      const mouth = mouths[0]!;
      expect(mouth.width).toBe('river');
      const inDir = TILE_ORIENTATIONS.indexOf(mouth.inDirections[0]!);
      expect(terrainAt(neighbors(mouth)[(inDir + 3) % 6]!)).toBe('sea');
    });

    it('builds everything inside the realm, which the model claimed itself', () => {
      const buildings = tiles.filter((t) => t.buildingType);
      expect(buildings.length).toBeGreaterThan(5);
      expect(buildings.filter((t) => t.ownerId !== LAND_EXAMPLE_SETTLEMENT).map(coordKey)).toEqual([]);
      expect(tileAt(LAND_EXAMPLE_START)!.buildingType).toBe('longhouse');
    });

    it('stands the bridge on a straight hex of the wide river', () => {
      const river = riverAt.get(coordKey(LAND_EXAMPLE_BRIDGE))!;
      expect(river.shape).toBe('straight');
      expect(ctx.isWideRiver(LAND_EXAMPLE_BRIDGE)).toBe(true);
    });

    it('builds a wall the placement rules allow, hex by hex, from a sea end on one coast to one on the other', () => {
      const wallHexes = tiles.filter((t) => t.buildingType === 'palisade' || t.buildingType === 'palisadegate');
      const placement = {
        terrainAt,
        isRiver: (c: AxialCoord) => riverAt.has(coordKey(c)),
        isWideRiver: ctx.isWideRiver,
        isPlainBog: (c: AxialCoord) => tileAt(c)?.bog?.kind === 'bog',
      };
      // Land hexes first (north to south), then the two sea ends, then the gate on its straight.
      const order = [
        ...wallHexes.filter((t) => t.terrain !== 'sea').sort((a, b) => a.r - b.r),
        ...wallHexes.filter((t) => t.terrain === 'sea'),
      ];
      const walls = new Set<string>();
      for (const t of order) {
        const wall: WallSet = { walls };
        expect(canPlacePalisade(t, wall, placement), coordKey(t)).toEqual({ ok: true });
        walls.add(coordKey(t));
      }
      expect(canPlacePalisade(LAND_EXAMPLE_GATE, { walls }, placement, { gate: true })).toEqual({ ok: true });
      const seaEnds = wallHexes.filter((t) => t.terrain === 'sea');
      expect(seaEnds).toHaveLength(2);
      for (const t of seaEnds) expect(t.isCoastalWater).toBe(true);
    });
  });

  describe('the route', () => {
    it('has a start and an end the route links', () => {
      expect(route.path[0]).toEqual(LAND_EXAMPLE_START);
      expect(route.path.at(-1)).toEqual(LAND_EXAMPLE_END);
    });

    it('goes around the mountain ridge and the bog: no step enters either', () => {
      const entered = route.path.map((c) => terrainAt(c));
      expect(entered).not.toContain('mountain');
      expect(entered).not.toContain('bog');
    });

    it('wades through the stream, crosses the wide river on the bridge and passes the gate', () => {
      expect(onPath.has(coordKey(LAND_EXAMPLE_BRIDGE))).toBe(true);
      expect(onPath.has(coordKey(LAND_EXAMPLE_GATE))).toBe(true);
      expect(route.hexes.map((s) => s.kind)).toEqual(expect.arrayContaining(['stream', 'bridge', 'gate']));
      // The wide river is only ever entered on the bridge.
      const wide = route.path.filter((c) => ctx.isWideRiver(c)).map(coordKey);
      expect(wide).toEqual([coordKey(LAND_EXAMPLE_BRIDGE)]);
    });

    it('lists the time spent on each hex: half the price on the first and the last, the full price on every hex between, 20.4 in all', () => {
      const costs = route.hexes.map((h) => h.cost);
      expect(route.hexes.map((h) => coordKey(h.coord))).toEqual(route.path.map(coordKey));
      expect(costs).toHaveLength(12);
      [0.5, 1.3, 1, 9, 1, 1, 1.3, 1.5, 1, 1.3, 1, 0.5].forEach((expected, i) => expect(costs[i], `hex ${i}`).toBeCloseTo(expected, 9));
      expect(costs.reduce((a, b) => a + b, 0)).toBeCloseTo(route.total, 9);
      expect(route.total).toBeCloseTo(20.4);
    });

    it('without the bridge wades where the two streams widen into the river, a longer and slower way', () => {
      const noBridge = tiles.map((t) =>
        t.buildingType === 'bridge' ? { ...t, buildingType: undefined, buildingLevel: undefined } : t,
      );
      const noBridgeCtx = landExampleContext(noBridge);
      const path = findPath(LAND_EXAMPLE_START, LAND_EXAMPLE_END, noBridgeCtx)!;
      expect(path.some((c) => noBridgeCtx.isWideRiver(c))).toBe(false);
      // The widening hex is not wide yet (only its outflow is), so it can be waded like a stream.
      const widen = LAND_EXAMPLE_RIVERS.find((r) => r.width === 'widen')!;
      expect(path.map(coordKey)).toContain(coordKey(widen));
      expect(pathCost(path, noBridgeCtx)).toBeGreaterThan(route.total);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { coordKey } from '../hex/coords';
import {
  LAND_EXAMPLE_BRIDGE,
  LAND_EXAMPLE_END,
  LAND_EXAMPLE_GATE,
  LAND_EXAMPLE_RIVERS,
  LAND_EXAMPLE_START,
  buildLandExampleTiles,
  landExampleContext,
  landExampleRoute,
} from './landMovementExample';
import { findPath } from '../map/hexPath';

describe('the land movement example island', () => {
  const tiles = buildLandExampleTiles();
  const route = landExampleRoute();
  const onPath = new Set(route.path.map(coordKey));
  const terrainOf = (k: string) => tiles.find((t) => coordKey(t) === k)!.terrain;

  it('has a start and an end the route links', () => {
    expect(route.path[0]).toEqual(LAND_EXAMPLE_START);
    expect(route.path.at(-1)).toEqual(LAND_EXAMPLE_END);
  });

  it('goes around the mountain ridge and the bog: no step enters either', () => {
    const entered = route.path.map((c) => terrainOf(coordKey(c)));
    expect(entered).not.toContain('mountain');
    expect(entered).not.toContain('bog');
    expect(tiles.filter((t) => t.terrain === 'mountain').length).toBeGreaterThanOrEqual(5);
    expect(tiles.filter((t) => t.terrain === 'bog').length).toBeGreaterThanOrEqual(3);
  });

  it('wades through the stream, crosses the wide river on the bridge and passes the gate', () => {
    expect(onPath.has(coordKey(LAND_EXAMPLE_BRIDGE))).toBe(true);
    expect(onPath.has(coordKey(LAND_EXAMPLE_GATE))).toBe(true);
    expect(route.steps.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['stream', 'bridge', 'gate']),
    );
    // The wide river is only ever entered on the bridge.
    const wide = LAND_EXAMPLE_RIVERS.filter((r) => r.width === 'river').map(coordKey);
    expect(wide.filter((k) => onPath.has(k))).toEqual([coordKey(LAND_EXAMPLE_BRIDGE)]);
  });

  it('costs 17: stream 9, bridge 1 and eight steps of ground and gate at 1', () => {
    expect(route.steps.map((s) => s.cost)).toEqual([1, 1, 1, 9, 1, 1, 1, 1, 1]);
    expect(route.total).toBe(17);
  });

  it('has no route without the bridge: the wide river shuts the island in two', () => {
    const noBridge = buildLandExampleTiles().map((t) =>
      t.buildingType === 'bridge' ? { ...t, buildingType: undefined, buildingLevel: undefined } : t,
    );
    expect(findPath(LAND_EXAMPLE_START, LAND_EXAMPLE_END, landExampleContext(noBridge))).toBeNull();
  });
});

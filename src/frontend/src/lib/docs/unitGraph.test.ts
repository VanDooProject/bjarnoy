import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import unitCatalogue from '../../data/unit-catalogue.json';
import { GRAPH_COL, GRAPH_X0, GRAPH_NODE_W, layoutUnitGraph, unitsByLevel } from './unitGraph';

const definitions = unitCatalogue.data as UnitDefinitionResponse[];
const unlock = (b: string) => ({ barracks: 5, archeryrange: 9, cartworkshop: 10, siegeworkshop: 18, harbour: 5, shipyard: 10 })[b] ?? null;

describe('layoutUnitGraph', () => {
  const layout = layoutUnitGraph(definitions, unlock);
  const node = (type: string) => layout.nodes.find((n) => n.type === type)!;

  it('makes one lane per training building, in catalogue order, stacked without overlap', () => {
    expect(layout.lanes.map((l) => l.building)).toEqual([
      'barracks',
      'archeryrange',
      'cartworkshop',
      'siegeworkshop',
      'harbour',
      'shipyard',
    ]);
    layout.lanes.slice(1).forEach((lane, i) => {
      const prev = layout.lanes[i]!;
      expect(lane.top).toBe(prev.top + prev.height);
    });
  });

  it('puts every unit at the column of the building level that opens it, inside its lane', () => {
    for (const d of definitions) {
      const n = node(d.type);
      const lane = layout.lanes.find((l) => l.building === d.requiredBuildingType)!;
      expect(n.x).toBe(GRAPH_X0 + GRAPH_COL * (d.requiredBuildingLevel - 0.5));
      expect(n.x - GRAPH_NODE_W / 2).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThan(lane.top);
      expect(n.y).toBeLessThan(lane.top + lane.height);
    }
  });

  it('shows a Longhouse badge only where the unit gate is above its building\'s unlock', () => {
    expect(node('axeman').longhouseBadge).toBeNull();
    expect(node('berserker').longhouseBadge).toBe(20);
    expect(node('spearman').longhouseBadge).toBeNull();
    expect(node('thrall').longhouseBadge).toBeNull();
  });

  it('has no arrows: no unit needs another unit, the building levels order them', () => {
    expect(definitions.every((d) => d.requiredUnitType === null)).toBe(true);
    expect('edges' in layout).toBe(false);
  });

  it('puts the Catapult at column 5 of the Siege Workshop lane and the Ram at column 10', () => {
    expect(node('catapult').x).toBe(GRAPH_X0 + GRAPH_COL * 4.5);
    expect(node('ram').x).toBe(GRAPH_X0 + GRAPH_COL * 9.5);
  });
});

describe('unitsByLevel', () => {
  it('orders one building\'s units by the level that opens them', () => {
    expect(unitsByLevel(definitions, 'barracks').map((r) => [r.level, r.units.map((u) => u.type)])).toEqual([
      [1, ['thrall']],
      [3, ['spearman']],
      [6, ['axeman']],
      [10, ['berserker']],
    ]);
  });
});

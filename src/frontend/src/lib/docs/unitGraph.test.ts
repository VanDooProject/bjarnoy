import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import unitCatalogue from '../../data/unit-catalogue.json';
import { GRAPH_COL, GRAPH_X0, GRAPH_NODE_W, edgePath, layoutUnitGraph, unitsByLevel } from './unitGraph';

const definitions = unitCatalogue.data as UnitDefinitionResponse[];
const unlock = (b: string) => ({ barracks: 5, archeryrange: 9, cartworkshop: 10, siegeworkshop: 18, dockyard: 8 })[b] ?? null;

describe('layoutUnitGraph', () => {
  const layout = layoutUnitGraph(definitions, unlock);
  const node = (type: string) => layout.nodes.find((n) => n.type === type)!;

  it('makes one lane per training building, in catalogue order, stacked without overlap', () => {
    expect(layout.lanes.map((l) => l.building)).toEqual([
      'barracks',
      'archeryrange',
      'cartworkshop',
      'siegeworkshop',
      'dockyard',
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
    expect(node('axeman').longhouseBadge).toBe(6);
    expect(node('berserker').longhouseBadge).toBe(20);
    expect(node('spearman').longhouseBadge).toBeNull();
    expect(node('thrall').longhouseBadge).toBeNull();
  });

  it('draws an arrow per prerequisite unit, across lanes where the buildings differ', () => {
    const pairs = layout.edges.map((e) => `${e.from}>${e.to}${e.cross ? ':cross' : ''}`).sort();
    expect(pairs).toContain('berserker>ram:cross');
    expect(pairs).toContain('berserker>catapult:cross');
    // The Berserker no longer needs the Axeman: the building level orders them.
    expect(pairs.some((p) => p.endsWith('>berserker'))).toBe(false);
  });

  it('stacks units that share a building level one under the other', () => {
    const ram = node('ram');
    const catapult = node('catapult');
    expect(ram.x).toBe(catapult.x);
    expect(ram.y).not.toBe(catapult.y);
  });

  it('builds a path for every edge', () => {
    for (const e of layout.edges) {
      const from = node(e.from);
      const to = node(e.to);
      expect(edgePath(from, to, e.cross)).toMatch(/^M/);
    }
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

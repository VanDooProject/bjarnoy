// The dependency graph is built from the real bundled catalogue snapshot, so
// these tests break if a backend prerequisite change lands without the
// snapshot being regenerated — which is the point: the page must not quietly
// draw a tree the game no longer enforces.
import { describe, expect, it } from 'vitest';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { ancestorsOf, buildGraph, descendantsOf, edgeKey, hoverSets } from './graph';
import { prerequisitesOf } from './nodes';
import { TECH_TREE_LAYOUT } from './layout';

const byType: Record<string, BuildingDefinitionResponse[]> = {};
for (const definition of catalogue.data as BuildingDefinitionResponse[]) {
  (byType[definition.type] ??= []).push(definition);
}
for (const list of Object.values(byType)) list.sort((a, b) => a.level - b.level);

const types = Object.keys(TECH_TREE_LAYOUT);
const graph = buildGraph(types, (type) => prerequisitesOf(byType, type));

describe('buildGraph', () => {
  it('takes its edges from the catalogue', () => {
    expect(graph.parents.get('barracks')).toEqual(['tower']);
    expect(graph.parents.get('archeryrange')).toEqual(['barracks']);
    expect(graph.parents.get('greatstorehouse')).toEqual(['storagehouse']);
  });

  it('hangs everything with no prerequisite of its own off the longhouse', () => {
    expect(graph.parents.get('lumberjack')).toEqual(['longhouse']);
    expect(graph.parents.get('storagehouse')).toEqual(['longhouse']);
    expect(graph.parents.get('longhouse')).toBeUndefined();
  });

  it('leaves no card unconnected', () => {
    for (const type of types) {
      if (type === 'longhouse') continue;
      expect(graph.parents.get(type), `${type} has no parent`).toBeTruthy();
    }
  });

  it('drops prerequisites naming a building the page does not show', () => {
    const withHidden = buildGraph(['longhouse', 'dockyard'], (type) =>
      type === 'dockyard' ? [{ type: 'fishinghut', level: 4 }] : [],
    );

    // Fishing hut isn't in this set, so the dockyard falls back to the anchor
    // rather than pointing at a card that isn't drawn.
    expect(withHidden.parents.get('dockyard')).toEqual(['longhouse']);
  });
});

describe('ancestry', () => {
  it('walks the whole chain, not just direct parents', () => {
    // Shrine of Thor needs both Barracks and Archery Range, and the latter
    // is itself downstream of the former — the join should still dedupe to
    // one flat ancestor set, not double-count the shared Tower/Longhouse root.
    expect(ancestorsOf(graph, 'shrineofthor')).toEqual(
      new Set(['barracks', 'archeryrange', 'tower', 'longhouse']),
    );
  });

  it('reports what a building leads to', () => {
    expect(descendantsOf(graph, 'farm')).toEqual(new Set(['pumpkinfarm', 'shrineoffreyja']));
    expect(descendantsOf(graph, 'tower')).toEqual(
      new Set(['barracks', 'archeryrange', 'shrineofthor']),
    );
    expect(descendantsOf(graph, 'quarry')).toEqual(new Set());
  });
});

describe('hoverSets', () => {
  it('is empty with nothing hovered', () => {
    const sets = hoverSets(graph, null);

    expect(sets.up.size).toBe(0);
    expect(sets.down.size).toBe(0);
    expect(sets.upKeys.size).toBe(0);
    expect(sets.downKeys.size).toBe(0);
  });

  it('lights the hovered card and its prerequisites, with their edges', () => {
    const sets = hoverSets(graph, 'greatstorehouse');

    expect(sets.up).toEqual(new Set(['greatstorehouse', 'storagehouse', 'longhouse']));
    expect(sets.upKeys).toEqual(
      new Set([edgeKey('longhouse', 'storagehouse'), edgeKey('storagehouse', 'greatstorehouse')]),
    );
    expect(sets.down.size).toBe(0);
  });

  it('keeps what the hovered card leads to in its own, dimmer set', () => {
    const sets = hoverSets(graph, 'barracks');

    expect(sets.up).toEqual(new Set(['barracks', 'tower', 'longhouse']));
    expect(sets.down).toEqual(new Set(['archeryrange', 'shrineofthor']));
    expect(sets.downKeys).toEqual(
      new Set([
        edgeKey('barracks', 'archeryrange'),
        edgeKey('archeryrange', 'shrineofthor'),
        edgeKey('barracks', 'shrineofthor'),
      ]),
    );
    // The edge into the hovered card belongs to the prerequisite side.
    expect(sets.upKeys).toEqual(new Set([edgeKey('longhouse', 'tower'), edgeKey('tower', 'barracks')]));
  });

  it('never puts one edge in both sets', () => {
    for (const type of types) {
      const sets = hoverSets(graph, type);
      for (const key of sets.upKeys) {
        expect(sets.downKeys.has(key), `${key} lit both ways hovering ${type}`).toBe(false);
      }
    }
  });
});

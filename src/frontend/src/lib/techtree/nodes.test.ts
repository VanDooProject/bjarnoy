import { describe, expect, it } from 'vitest';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { buildTechTreeNodes, prerequisitesOf, unlockLevel } from './nodes';
import { HIDDEN_FROM_DOCS, TECH_TREE_LAYOUT } from './layout';

const byType: Record<string, BuildingDefinitionResponse[]> = {};
for (const definition of catalogue.data as BuildingDefinitionResponse[]) {
  (byType[definition.type] ??= []).push(definition);
}
for (const list of Object.values(byType)) list.sort((a, b) => a.level - b.level);

const nodes = buildTechTreeNodes(byType);
const byName = new Map(nodes.map((n) => [n.type, n]));

describe('buildTechTreeNodes', () => {
  it('draws one card per laid-out building the catalogue knows', () => {
    expect(nodes).toHaveLength(Object.keys(TECH_TREE_LAYOUT).length);
  });

  it('leaves the buildings hidden from the docs out entirely', () => {
    for (const type of HIDDEN_FROM_DOCS) {
      expect(byType[type], `${type} should still be in the catalogue`).toBeTruthy();
      expect(byName.has(type), `${type} should not be drawn`).toBe(false);
    }
  });

  it('takes the longhouse chip from the real unlock level', () => {
    // The chip follows the catalogue's unlock ladder rather than repeat a
    // number from a mockup: Tower LH 3, Barracks LH 5, Weaponsmith LH 15.
    expect(byName.get('tower')!.chips[0]).toEqual({ text: 'LH 3', kind: 'longhouse' });
    expect(byName.get('barracks')!.chips[0]).toEqual({ text: 'LH 5', kind: 'longhouse' });
    expect(byName.get('smithy')!.chips[0]).toEqual({ text: 'LH 15', kind: 'longhouse' });
    expect(byName.get('lumberjack')!.chips[0]).toEqual({ text: 'LH 1', kind: 'longhouse' });
  });

  it('gives the anchor its own chip and no longhouse gate', () => {
    expect(byName.get('longhouse')!.chips).toEqual([{ text: 'Anchor', kind: 'anchor' }]);
    expect(byName.get('longhouse')!.isAnchor).toBe(true);
  });

  it('lists real prerequisites as short chips', () => {
    expect(byName.get('storagehouse')!.chips).toEqual([{ text: 'LH 1', kind: 'longhouse' }]);
    expect(byName.get('greatstorehouse')!.chips).toEqual([
      { text: 'LH 15', kind: 'longhouse' },
      { text: 'Storage 15', kind: 'building' },
    ]);
    expect(byName.get('shrineofthor')!.chips).toEqual([
      { text: 'LH 25', kind: 'longhouse' },
      { text: 'Weaponsmith 5', kind: 'building' },
    ]);
  });

  it('describes what a building gives from the shared stats helper', () => {
    expect(byName.get('lumberjack')!.gives).toBe('+40 wood/h');
    expect(byName.get('storagehouse')!.gives).toBe('+600 storage capacity');
    expect(byName.get('barracks')!.gives).toBe('Trains land troops');
  });

  it('positions cards on the layout grid', () => {
    expect(byName.get('longhouse')!.x).toBe(0);
    expect(byName.get('lumberjack')!.y).toBe(0);
  });

  it('skips a laid-out building the catalogue has never heard of', () => {
    const drawn = buildTechTreeNodes(byType, { longhouse: [0, 0], claypit: [1, 0] });

    expect(drawn.map((n) => n.type)).toEqual(['longhouse']);
  });
});

describe('unlockLevel and prerequisitesOf', () => {
  it('read the level-1 definition, not the whole ladder', () => {
    expect(unlockLevel(byType.tower!)).toBe(3);
    expect(prerequisitesOf(byType, 'archeryrange')).toEqual([{ type: 'barracks', level: 5 }]);
  });

  it('report nothing for a building the catalogue does not have', () => {
    expect(prerequisitesOf(byType, 'claypit')).toEqual([]);
    expect(unlockLevel([])).toBe(1);
  });
});

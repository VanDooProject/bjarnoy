import { describe, expect, it } from 'vitest';
import { SHIP_GROUPS, groupByShipGroup, shipGroupOf } from './shipGroups';

describe('shipGroups', () => {
  it('puts every ship in its job group', () => {
    expect(['faering', 'byrding', 'knarr', 'karve', 'snekkja', 'skeid', 'fireraft', 'firehulk'].map(shipGroupOf)).toEqual([
      'scouts', 'cargo', 'cargo', 'transport', 'warships', 'warships', 'fireCraft', 'fireCraft',
    ]);
    expect(shipGroupOf('spearman')).toBeNull();
  });

  it('keeps the group order and the row order inside a group', () => {
    const rows = ['firehulk', 'snekkja', 'byrding', 'faering', 'fireraft', 'knarr'].map((unit) => ({ unit }));
    const grouped = groupByShipGroup(rows, (r) => r.unit);
    expect(grouped.map((g) => g.group)).toEqual(['scouts', 'cargo', 'warships', 'fireCraft']);
    expect(grouped[1]!.rows.map((r) => r.unit)).toEqual(['byrding', 'knarr']);
    expect(grouped[3]!.rows.map((r) => r.unit)).toEqual(['fireraft', 'firehulk']);
    expect(SHIP_GROUPS).toHaveLength(5);
  });

  it('leaves land units in one ungrouped block', () => {
    const grouped = groupByShipGroup([{ unit: 'thrall' }, { unit: 'spearman' }], (r) => r.unit);
    expect(grouped).toEqual([{ group: null, rows: [{ unit: 'thrall' }, { unit: 'spearman' }] }]);
  });
});

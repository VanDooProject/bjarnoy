import { describe, expect, it } from 'vitest';
import { lane1Arc } from './ringLayout';
import { buildingEntryId, primaryActionFirst } from './ringActions';

const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('primaryActionFirst', () => {
  it('puts Build or Upgrade first and keeps the order of the rest', () => {
    expect(ids(primaryActionFirst([{ id: 'hunt' }, { id: 'build' }, { id: 'send-army' }]))).toEqual(['build', 'hunt', 'send-army']);
    expect(ids(primaryActionFirst([{ id: 'raze' }, { id: 'train' }, { id: 'upgrade' }, { id: 'send-army' }]))).toEqual([
      'upgrade',
      'raze',
      'train',
      'send-army',
    ]);
  });

  it('leaves a ring without either untouched', () => {
    expect(ids(primaryActionFirst([{ id: 'hunt' }, { id: 'send-army' }]))).toEqual(['hunt', 'send-army']);
  });
});

describe('the first slot of the ring', () => {
  const area = { left: 0, top: 0, right: 1600, bottom: 900 };
  it('is straight above the tile at 12 o clock however many actions follow', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const [first] = lane1Arc(n, 800, 450, area)!;
      expect(first.x).toBeCloseTo(800);
      expect(first.y).toBeLessThan(450);
    }
  });
});

describe('buildingEntryId', () => {
  it('offers Train on unit buildings and Feasts on a finished Town Square only', () => {
    expect(buildingEntryId('barracks', 1)).toBe('train');
    expect(buildingEntryId('townsquare', 1)).toBe('feasts');
    expect(buildingEntryId('townsquare', 0)).toBeNull();
    expect(buildingEntryId('longhouse', 3)).toBeNull();
  });
});

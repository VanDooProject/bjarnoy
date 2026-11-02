import { describe, expect, it } from 'vitest';
import { armyAttackPower, huntOutlook, huntSummaryFor } from './huntSummary';

const camp = (over: Record<string, unknown> = {}) => ({
  family: 'wolfden',
  level: 1,
  orientation: 'SE' as const,
  strong: true,
  guardRange: 3,
  ...over,
});

describe('huntSummaryFor', () => {
  it('treats a camp without live state as pristine and aggressive', () => {
    const s = huntSummaryFor(camp(), 0);
    expect(s.status).toBe('aggressive');
    expect(s.campDefense).toBe(195);
    expect(s.tiers.map((t) => t.count)).toEqual([3, 6, 0]);
    expect(s.loot.food).toBe(600);
    expect(s.loot.iron).toBe(600);
  });

  it('reports calm until a future instant, and empty when cleared', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(huntSummaryFor(camp({ calmUntil: '2026-01-02T00:00:00Z', aggressive: false }), now).status).toBe('calm');
    expect(huntSummaryFor(camp({ calmUntil: '2025-12-31T00:00:00Z' }), now).status).toBe('aggressive');
    const empty = huntSummaryFor(
      camp({
        empty: true,
        garrison: { young: 0, adult: 0, alpha: 0 },
        fullGarrison: { young: 3, adult: 6, alpha: 0 },
        leftover: { wood: 0, stone: 0, food: 12, iron: 0 },
      }),
      now,
    );
    expect(empty.status).toBe('empty');
    expect(empty.loot).toEqual({ wood: 0, stone: 0, food: 12, iron: 0 });
  });

  it('weak camps are merely guarded', () => {
    expect(huntSummaryFor(camp({ family: 'deerglade', strong: false }), 0).status).toBe('guarded');
  });
});

describe('huntOutlook', () => {
  const summary = huntSummaryFor(camp(), 0);
  it('compares army attack with camp defense, ties to the camp', () => {
    expect(huntOutlook(0, summary)).toBe('noArmy');
    expect(huntOutlook(195, summary)).toBe('lose');
    expect(huntOutlook(196, summary)).toBe('win');
  });
  it('sums unit attack', () => {
    expect(armyAttackPower({ spear: 3, ghost: 2, axe: 0 }, { spear: { attack: 10 } as never, axe: { attack: 99 } as never })).toBe(30);
  });
});

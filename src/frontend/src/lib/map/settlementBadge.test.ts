import { describe, expect, it } from 'vitest';
import { settlementBadgeSuffix } from './settlementBadge';

describe('settlementBadgeSuffix', () => {
  it('shows the Longhouse level, with "you" for the player\'s own', () => {
    expect(settlementBadgeSuffix({ level: 4 }, true, false, 'Beach camp')).toBe('you · Lv 4');
    expect(settlementBadgeSuffix({ level: 4 }, false, false, 'Beach camp')).toBe('Lv 4');
  });

  it('names a beach camp instead of giving it a level', () => {
    expect(settlementBadgeSuffix({ level: 0 }, true, true, 'Beach camp')).toBe('you · Beach camp');
    expect(settlementBadgeSuffix({ level: 0 }, false, true, 'Strandlager')).toBe('Strandlager');
  });
});

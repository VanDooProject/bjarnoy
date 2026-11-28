import { describe, expect, it } from 'vitest';
import { settlementBadgeSuffix, type BadgeSuffixText } from './settlementBadge';

const text: BadgeSuffixText = {
  you: 'you',
  beachCamp: 'Beach camp',
  level: (level) => `Lv ${level}`,
  join: (who, kind) => `${who} · ${kind}`,
};

describe('settlementBadgeSuffix', () => {
  it('shows "you" and the Longhouse level for the player\'s own settlement', () => {
    expect(settlementBadgeSuffix({ level: 4, ownerName: 'Jarl-1234' }, true, false, text)).toBe('you · Lv 4');
  });

  it('shows the owner\'s name instead of "you" for a rival', () => {
    expect(settlementBadgeSuffix({ level: 4, ownerName: 'Jarl-f0da' }, false, false, text)).toBe('Jarl-f0da · Lv 4');
  });

  it('names a beach camp instead of giving it a level, for both', () => {
    expect(settlementBadgeSuffix({ level: 0, ownerName: 'Jarl-1234' }, true, true, text)).toBe('you · Beach camp');
    expect(settlementBadgeSuffix({ level: 0, ownerName: 'Jarl-f0da' }, false, true, text)).toBe('Jarl-f0da · Beach camp');
  });

  it('uses the given localized pieces', () => {
    const de: BadgeSuffixText = { ...text, you: 'du', beachCamp: 'Strandlager' };
    expect(settlementBadgeSuffix({ level: 0, ownerName: 'x' }, true, true, de)).toBe('du · Strandlager');
  });
});

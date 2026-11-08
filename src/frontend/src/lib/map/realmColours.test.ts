import { describe, expect, it } from 'vitest';
import {
  GUILD_REALM_COLOR,
  OWN_REALM_COLOR,
  realmColor,
  RIVAL_REALM_COLOR,
  TREATY_REALM_COLOR,
} from './realmColours';
import type { Settlement } from './types';

function settlement(patch: Partial<Settlement>): Settlement {
  return { id: 's', ownerId: 'someone', ownerName: 'x', name: 'n', q: 0, r: 0, level: 1, foundedAt: 0, ...patch } as Settlement;
}

describe('realmColor', () => {
  it('draws the player\'s own settlement blue', () => {
    expect(realmColor(settlement({ ownerId: 'me' }), 'me')).toBe(OWN_REALM_COLOR);
  });

  it('keeps own blue even if a relation is set', () => {
    expect(realmColor(settlement({ ownerId: 'me', relation: 'guild' }), 'me')).toBe(OWN_REALM_COLOR);
  });

  it('draws a guild mate green and a treaty partner purple', () => {
    expect(realmColor(settlement({ relation: 'guild' }), 'me')).toBe(GUILD_REALM_COLOR);
    expect(realmColor(settlement({ relation: 'treaty' }), 'me')).toBe(TREATY_REALM_COLOR);
  });

  it('draws everyone else, and an unknown settlement, red', () => {
    expect(realmColor(settlement({}), 'me')).toBe(RIVAL_REALM_COLOR);
    expect(realmColor(undefined, 'me')).toBe(RIVAL_REALM_COLOR);
  });

  it('keeps the four colours distinct', () => {
    expect(new Set([OWN_REALM_COLOR, GUILD_REALM_COLOR, TREATY_REALM_COLOR, RIVAL_REALM_COLOR]).size).toBe(4);
  });
});

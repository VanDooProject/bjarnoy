import { describe, expect, it } from 'vitest';
import { joinBlockedKey } from './joinBlocked';

describe('joinBlockedKey', () => {
  // Regression: the landing page compared against the PascalCase enum names while the backend sends them lowercased,
  // so "opens at" and "joins closed" never showed there.
  it('reads the lowercased wire values', () => {
    expect(joinBlockedKey('notstartedyet', '2026-12-01T00:00:00Z')).toBe('opensAt');
    expect(joinBlockedKey('joinsclosed', null)).toBe('joinsClosed');
  });

  it('needs a start date to say when the world opens', () => {
    expect(joinBlockedKey('notstartedyet', null)).toBe('notAcceptingPlayers');
  });

  it('reads the store\'s own NoWorldYet', () => {
    expect(joinBlockedKey('NoWorldYet', null)).toBe('noWorldYet');
  });

  it('falls back for every other reason', () => {
    expect(joinBlockedKey('full', null)).toBe('notAcceptingPlayers');
    expect(joinBlockedKey('worldnotactive', null)).toBe('notAcceptingPlayers');
  });
});

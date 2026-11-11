import { describe, expect, it } from 'vitest';
import { realmToSwitchTo } from './realmTap';

const own = (id: string | null | undefined) => (id === 'a-member' ? 'a' : id === 'b' ? 'b' : null);

describe('realmToSwitchTo', () => {
  it('switches to another own realm in the settlement view', () => {
    expect(realmToSwitchTo('settlement', 'b', 'a', own)).toBe('b');
  });
  it('maps a linked member to its realm', () => {
    expect(realmToSwitchTo('settlement', 'a-member', 'b', own)).toBe('a');
  });
  it('does not switch for the realm already run', () => {
    expect(realmToSwitchTo('settlement', 'a-member', 'a', own)).toBeNull();
  });
  it('does not switch at world zoom', () => {
    expect(realmToSwitchTo('world', 'b', 'a', own)).toBeNull();
  });
  it('does not switch for a rival or unowned hex', () => {
    expect(realmToSwitchTo('settlement', 'rival', 'a', own)).toBeNull();
    expect(realmToSwitchTo('settlement', undefined, 'a', own)).toBeNull();
  });
});

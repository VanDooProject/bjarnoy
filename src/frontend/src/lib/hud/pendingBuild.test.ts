import { describe, expect, it } from 'vitest';
import { nextUpgradeLevel } from './pendingBuild';

describe('nextUpgradeLevel', () => {
  const at = { q: 3, r: -2 };

  it('is one above the built level on an idle hex', () => {
    expect(nextUpgradeLevel(2, [], at)).toBe(3);
  });

  it('queues behind a running upgrade on the same hex', () => {
    const queue = [{ q: 3, r: -2, kind: 'build' as const, targetLevel: 3 }, { q: 0, r: 0, kind: 'build' as const, targetLevel: 6 }];
    expect(nextUpgradeLevel(2, queue, at)).toBe(4);
  });

  it('ignores a raze order on the hex', () => {
    expect(nextUpgradeLevel(2, [{ q: 3, r: -2, kind: 'raze' as const, targetLevel: 1 }], at)).toBe(3);
  });

  it('ignores orders on other hexes', () => {
    expect(nextUpgradeLevel(2, [{ q: 0, r: 0, kind: 'build' as const, targetLevel: 6 }], at)).toBe(3);
  });
});

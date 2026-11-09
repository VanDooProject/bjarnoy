import { describe, expect, it } from 'vitest';
import { nextUpgradeLevel } from './pendingBuild';

describe('nextUpgradeLevel', () => {
  const at = { q: 3, r: -2 };
  const buildings = [{ q: 3, r: -2, level: 2 }, { q: 0, r: 0, level: 5 }];

  it('is one above the built level on an idle hex', () => {
    expect(nextUpgradeLevel(buildings, [], at)).toBe(3);
  });

  it('queues behind a running upgrade on the same hex', () => {
    const queue = [{ q: 3, r: -2, kind: 'build' as const, targetLevel: 3 }, { q: 0, r: 0, kind: 'build' as const, targetLevel: 6 }];
    expect(nextUpgradeLevel(buildings, queue, at)).toBe(4);
  });

  it('ignores a raze order on the hex', () => {
    expect(nextUpgradeLevel(buildings, [{ q: 3, r: -2, kind: 'raze' as const, targetLevel: 1 }], at)).toBe(3);
  });

  it('is null without a building there', () => {
    expect(nextUpgradeLevel(buildings, [], { q: 9, r: 9 })).toBeNull();
  });
});

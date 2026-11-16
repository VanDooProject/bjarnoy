import { describe, expect, it } from 'vitest';
import { cancellableBuildOrder } from './ringActions';

const order = (id: string, q: number, r: number, kind: 'build' | 'raze' = 'build') => ({ id, q, r, kind });

describe('cancellableBuildOrder', () => {
  it('offers the newest build order on the hex', () => {
    const queue = [order('a', 1, 1), order('b', 2, 2), order('c', 1, 1)];
    expect(cancellableBuildOrder(queue, { q: 1, r: 1 })?.id).toBe('c');
  });

  it('offers nothing on a hex without an order', () => {
    expect(cancellableBuildOrder([order('a', 1, 1)], { q: 3, r: 3 })).toBeUndefined();
  });

  it('offers nothing when the newest order is a raze', () => {
    expect(cancellableBuildOrder([order('a', 1, 1), order('b', 1, 1, 'raze')], { q: 1, r: 1 })).toBeUndefined();
  });
});

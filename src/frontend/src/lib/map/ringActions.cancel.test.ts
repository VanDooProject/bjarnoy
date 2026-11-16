import { describe, expect, it } from 'vitest';
import { cancellableOrder } from './ringActions';

const order = (id: string, q: number, r: number, kind: 'build' | 'raze' = 'build') => ({ id, q, r, kind });

describe('cancellableOrder', () => {
  it('offers the newest order on the hex', () => {
    const queue = [order('a', 1, 1), order('b', 2, 2), order('c', 1, 1)];
    expect(cancellableOrder(queue, { q: 1, r: 1 })?.id).toBe('c');
  });

  it('offers a raze when it is the newest', () => {
    expect(cancellableOrder([order('a', 1, 1), order('b', 1, 1, 'raze')], { q: 1, r: 1 })?.id).toBe('b');
  });

  it('offers nothing on a hex without an order', () => {
    expect(cancellableOrder([order('a', 1, 1)], { q: 3, r: 3 })).toBeUndefined();
  });
});

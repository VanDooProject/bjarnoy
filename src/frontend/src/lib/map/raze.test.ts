import { describe, expect, it } from 'vitest';
import { RAZE_REFUND_FRACTION, RAZE_TIME_FACTOR, razeBlock, razeRefund, razeSeconds } from './raze';
import { computeAvailability } from './ringAvailability';

const availabilityFor = (over: { slotsUsed?: number; maxWaitingOrders?: number; hexBusy?: boolean }) =>
  computeAvailability({
    cost: undefined,
    available: { wood: 0, stone: 0, food: 0, iron: 0 },
    slotsNeeded: 1,
    construction: { slots: 2, slotsUsed: over.slotsUsed ?? 0, maxWaitingOrders: over.maxWaitingOrders ?? 0, waitingOrders: 0 },
    queue: [],
    locked: false,
    hexBusy: over.hexBusy,
  });

describe('raze numbers', () => {
  it('takes three quarters of the level build time', () => {
    expect(RAZE_TIME_FACTOR).toBe(0.75);
    expect(razeSeconds(400)).toBe(300);
  });

  it('refunds a third of the level cost, rounded down per resource', () => {
    expect(RAZE_REFUND_FRACTION).toBeCloseTo(1 / 3);
    expect(razeRefund({ wood: 100, stone: 80, food: 0, iron: 2 })).toEqual({ wood: 33, stone: 26, food: 0, iron: 0 });
    expect(razeRefund({ wood: 90, stone: 60, food: 30, iron: 3 })).toEqual({ wood: 30, stone: 20, food: 10, iron: 1 });
  });
});

describe('razeBlock', () => {
  it('never lets the longhouse be razed', () => {
    expect(razeBlock('longhouse', false, availabilityFor({}))).toBe('longhouse');
  });

  it('blocks a hex that already has an order, even with a free slot', () => {
    expect(razeBlock('farm', true, availabilityFor({ hexBusy: true, maxWaitingOrders: 3 }))).toBe('hexBusy');
  });

  it('blocks without a free slot and without waiting room, but not when the waiting queue has room', () => {
    expect(razeBlock('farm', false, availabilityFor({ slotsUsed: 2 }))).toBe('noSlot');
    expect(razeBlock('farm', false, availabilityFor({ slotsUsed: 2, maxWaitingOrders: 3 }))).toBeNull();
  });

  it('is free to go with a free slot', () => {
    expect(razeBlock('farm', false, availabilityFor({ slotsUsed: 1 }))).toBeNull();
  });
});

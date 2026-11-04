import { describe, expect, it } from 'vitest';
import {
  computeAvailability,
  isActionable,
  missingPrerequisites,
  nextSlotFreeInSeconds,
  resourceShortfall,
  slotsNeeded,
  type RingAvailabilityInput,
} from './ringAvailability';

const RICH = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };

function input(overrides: Partial<RingAvailabilityInput> = {}): RingAvailabilityInput {
  return {
    cost: { wood: 100, stone: 80 },
    available: RICH,
    slotsNeeded: 1,
    construction: { slots: 2, slotsUsed: 0, maxWaitingOrders: 0, waitingOrders: 0 },
    queue: [],
    locked: false,
    ...overrides,
  };
}

describe('slotsNeeded', () => {
  it('defaults to one slot and honours slotCost', () => {
    expect(slotsNeeded(undefined, 3)).toBe(1);
    expect(slotsNeeded({ slotCost: 1, occupiesAllSlots: false }, 3)).toBe(1);
    expect(slotsNeeded({ slotCost: 2, occupiesAllSlots: false }, 3)).toBe(2);
  });

  it('takes every slot the settlement has for an occupiesAllSlots level, whatever slotCost says', () => {
    expect(slotsNeeded({ slotCost: 1, occupiesAllSlots: true }, 4)).toBe(4);
  });
});

describe('resourceShortfall', () => {
  it('lists only the short resources, by how much', () => {
    expect(resourceShortfall({ wood: 100, stone: 80, iron: 5 }, { wood: 70, stone: 80, food: 0, iron: 0 })).toEqual({
      wood: 30,
      iron: 5,
    });
  });

  it('is empty without a cost or stock', () => {
    expect(resourceShortfall(undefined, RICH)).toEqual({});
    expect(resourceShortfall({ wood: 1 }, undefined)).toEqual({});
  });
});

describe('nextSlotFreeInSeconds', () => {
  it('is the soonest building order, ignoring waiting orders and unknown times', () => {
    expect(
      nextSlotFreeInSeconds([
        { state: 'building', completesInSeconds: 300 },
        { state: 'building', completesInSeconds: 190 },
        { state: 'waiting', completesInSeconds: null },
        { state: 'building', completesInSeconds: null },
      ]),
    ).toBe(190);
  });

  it('is null when nothing reports a time', () => {
    expect(nextSlotFreeInSeconds([])).toBeNull();
    expect(nextSlotFreeInSeconds([{ state: 'waiting', completesInSeconds: 10 }])).toBeNull();
  });
});

describe('missingPrerequisites', () => {
  it('judges each prerequisite on the highest level of its type', () => {
    expect(
      missingPrerequisites(
        [
          { type: 'barracks', level: 2 },
          { type: 'farm', level: 1 },
        ],
        { barracks: 1, farm: 3 },
      ),
    ).toEqual([{ type: 'barracks', level: 2 }]);
  });

  it('counts an absent type as level 0', () => {
    expect(missingPrerequisites([{ type: 'barracks', level: 1 }], {})).toEqual([{ type: 'barracks', level: 1 }]);
  });

  it('is empty when there are none', () => {
    expect(missingPrerequisites(undefined, {})).toEqual([]);
  });
});

describe('computeAvailability', () => {
  it('is ready with enough resources and a free slot', () => {
    const a = computeAvailability(input());
    expect(a.state).toBe('ready');
    expect(a.slots).toEqual({ needed: 1, total: 2, free: 2, short: false });
    expect(a.nextSlotFreeInSeconds).toBeNull();
  });

  it('is locked whatever else holds', () => {
    expect(computeAvailability(input({ locked: true, available: { wood: 0, stone: 0, food: 0, iron: 0 } })).state).toBe('locked');
  });

  it('is waiting when the available stock is short, and says by how much', () => {
    const a = computeAvailability(input({ available: { wood: 70, stone: 80, food: 0, iron: 0 } }));
    expect(a.state).toBe('waiting');
    expect(a.shortfall).toEqual({ wood: 30 });
  });

  it('stays waiting when resources are short even though the premium queue has room', () => {
    const a = computeAvailability(
      input({
        available: { wood: 0, stone: 0, food: 0, iron: 0 },
        construction: { slots: 2, slotsUsed: 2, maxWaitingOrders: 3, waitingOrders: 0 },
      }),
    );
    expect(a.state).toBe('waiting');
  });

  it('is waiting when no slot is free and there is no waiting queue (non-premium), with the next-free time', () => {
    const a = computeAvailability(
      input({
        construction: { slots: 3, slotsUsed: 3, maxWaitingOrders: 0, waitingOrders: 0 },
        queue: [
          { state: 'building', completesInSeconds: 192 },
          { state: 'building', completesInSeconds: 600 },
        ],
      }),
    );
    expect(a.state).toBe('waiting');
    expect(a.slots).toMatchObject({ free: 0, short: true });
    expect(a.nextSlotFreeInSeconds).toBe(192);
  });

  it('is waiting when the waiting queue is full too', () => {
    const a = computeAvailability(input({ construction: { slots: 2, slotsUsed: 2, maxWaitingOrders: 2, waitingOrders: 2 } }));
    expect(a.state).toBe('waiting');
    expect(a.queue).toEqual({ hasRoom: false, waiting: 2, max: 2 });
  });

  it('queues when slots are full but the premium waiting queue has room', () => {
    const a = computeAvailability(input({ construction: { slots: 2, slotsUsed: 2, maxWaitingOrders: 3, waitingOrders: 1 } }));
    expect(a.state).toBe('queues');
    expect(a.queue).toEqual({ hasRoom: true, waiting: 1, max: 3 });
  });

  it('needs several free slots for a multi-slot building', () => {
    const construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0 };
    expect(computeAvailability(input({ slotsNeeded: 1, construction })).state).toBe('ready');
    const two = computeAvailability(input({ slotsNeeded: 2, construction }));
    expect(two.state).toBe('waiting');
    expect(two.slots).toEqual({ needed: 2, total: 3, free: 1, short: true });
  });

  it('treats an unfinished earlier order on the same hex as not fitting now', () => {
    expect(computeAvailability(input({ hexBusy: true })).state).toBe('waiting');
  });

  it('never reports negative free slots', () => {
    const a = computeAvailability(input({ construction: { slots: 2, slotsUsed: 5, maxWaitingOrders: 0, waitingOrders: 0 } }));
    expect(a.slots.free).toBe(0);
  });
});

describe('isActionable', () => {
  it('lets ready and queueing bubbles through and blocks locked and waiting ones', () => {
    expect(isActionable('ready')).toBe(true);
    expect(isActionable('queues')).toBe(true);
    expect(isActionable(undefined)).toBe(true);
    expect(isActionable('waiting')).toBe(false);
    expect(isActionable('locked')).toBe(false);
  });
});

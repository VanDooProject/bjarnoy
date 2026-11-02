// Whether a ring-menu bubble (a building, or the root Upgrade action) can be
// used right now, and if not, why. Pure and text-free on purpose: the ring
// card renders the wording through vue-i18n, and the rules here only mirror
// the backend's `Settlement.PlanBuild` decision (nothing is re-derived):
//
//  - progression blockers (longhouse level, prerequisite buildings, the
//    tower / shrine / storage house / wall limits) are `locked` — they only
//    change when the player builds something else;
//  - a temporary shortage — not enough AVAILABLE resources (stock minus what
//    the waiting queue has reserved), or not enough free construction slots
//    and no room in the premium waiting queue — is `waiting`;
//  - enough resources but no free slots while the waiting queue has room is
//    `queues`: the click is accepted, as a waiting order;
//  - everything else is `ready`.

export type RingResourceKey = 'wood' | 'stone' | 'food' | 'iron';
export type RingCost = Partial<Record<RingResourceKey, number>>;
export type RingStock = Record<RingResourceKey, number>;

export const RING_RESOURCE_KEYS: readonly RingResourceKey[] = ['wood', 'stone', 'food', 'iron'];

export type RingAvailabilityState = 'ready' | 'queues' | 'waiting' | 'locked';

export interface RingConstruction {
  slots: number;
  slotsUsed: number;
  maxWaitingOrders: number;
  waitingOrders: number;
}

export interface RingQueueOrder {
  state: 'building' | 'waiting';
  completesInSeconds: number | null;
}

export interface RingAvailability {
  state: RingAvailabilityState;
  /** Per resource, how much is missing against the available stock (only the short ones). */
  shortfall: Partial<Record<RingResourceKey, number>>;
  slots: {
    needed: number;
    total: number;
    /** Free right now; never negative. */
    free: number;
    /** Needed more than are free (or an earlier order on the same hex is still unfinished). */
    short: boolean;
  };
  queue: {
    /** The premium waiting queue can take one more order. */
    hasRoom: boolean;
    waiting: number;
    max: number;
  };
  /** Seconds until the soonest building order frees its slot(s); null when unknown (demo mode, nothing building). */
  nextSlotFreeInSeconds: number | null;
}

/** Slots one order of this definition occupies: every slot for an `occupiesAllSlots` level, else its `slotCost` (default 1). */
export function slotsNeeded(
  definition: { slotCost?: number; occupiesAllSlots?: boolean } | undefined,
  totalSlots: number,
): number {
  if (definition?.occupiesAllSlots) return Math.max(1, totalSlots);
  return Math.max(1, definition?.slotCost ?? 1);
}

/** The resources `cost` exceeds `available` by (only the short ones, rounded up). */
export function resourceShortfall(cost: RingCost | undefined, available: RingStock | undefined): Partial<Record<RingResourceKey, number>> {
  const short: Partial<Record<RingResourceKey, number>> = {};
  if (!cost || !available) return short;
  for (const key of RING_RESOURCE_KEYS) {
    const need = cost[key] ?? 0;
    if (need > available[key]) short[key] = Math.ceil(need - available[key]);
  }
  return short;
}

/** Soonest completion among orders that are under construction, or null when none reports a time. */
export function nextSlotFreeInSeconds(queue: readonly RingQueueOrder[]): number | null {
  let soonest: number | null = null;
  for (const order of queue) {
    if (order.state !== 'building' || order.completesInSeconds === null) continue;
    soonest = soonest === null ? order.completesInSeconds : Math.min(soonest, order.completesInSeconds);
  }
  return soonest === null ? null : Math.max(0, soonest);
}

/**
 * Prerequisites (all required) not yet met, judged on the settlement's
 * highest level of each type — mirrors `Settlement.HighestLevelOf`.
 */
export function missingPrerequisites(
  prerequisites: readonly { type: string; level: number }[] | undefined,
  highestLevels: Readonly<Record<string, number | undefined>>,
): { type: string; level: number }[] {
  return (prerequisites ?? []).filter((p) => (highestLevels[p.type] ?? 0) < p.level).map((p) => ({ type: p.type, level: p.level }));
}

export interface RingAvailabilityInput {
  cost: RingCost | undefined;
  /** `hud.available` — stock minus the waiting queue's reservation. */
  available: RingStock | undefined;
  /** Slots one order occupies (see `slotsNeeded`). */
  slotsNeeded: number;
  construction: RingConstruction;
  queue: readonly RingQueueOrder[];
  /** Any progression blocker applies. */
  locked: boolean;
  /** An earlier order on the same hex is unfinished, so this one cannot start now whatever the slots say. */
  hexBusy?: boolean;
}

export function computeAvailability(input: RingAvailabilityInput): RingAvailability {
  const { construction } = input;
  const free = Math.max(0, construction.slots - construction.slotsUsed);
  const slotsShort = !!input.hexBusy || input.slotsNeeded > free;
  const queueHasRoom = construction.maxWaitingOrders > 0 && construction.waitingOrders < construction.maxWaitingOrders;
  const shortfall = resourceShortfall(input.cost, input.available);
  const resourcesShort = Object.keys(shortfall).length > 0;

  let state: RingAvailabilityState = 'ready';
  if (input.locked) state = 'locked';
  else if (resourcesShort) state = 'waiting';
  else if (slotsShort) state = queueHasRoom ? 'queues' : 'waiting';

  return {
    state,
    shortfall,
    slots: { needed: input.slotsNeeded, total: construction.slots, free, short: slotsShort },
    queue: { hasRoom: queueHasRoom, waiting: construction.waitingOrders, max: construction.maxWaitingOrders },
    nextSlotFreeInSeconds: slotsShort ? nextSlotFreeInSeconds(input.queue) : null,
  };
}

/** Whether a click on a bubble in this state may go through. */
export function isActionable(state: RingAvailabilityState | undefined): boolean {
  return state === undefined || state === 'ready' || state === 'queues';
}

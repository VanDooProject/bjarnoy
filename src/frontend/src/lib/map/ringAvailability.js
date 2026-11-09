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
export const RING_RESOURCE_KEYS = ['wood', 'stone', 'food', 'iron'];
/** Slots one order of this definition occupies: every slot for an `occupiesAllSlots` level, else its `slotCost` (default 1). */
export function slotsNeeded(definition, totalSlots) {
    if (definition?.occupiesAllSlots)
        return Math.max(1, totalSlots);
    return Math.max(1, definition?.slotCost ?? 1);
}
/** The resources `cost` exceeds `available` by (only the short ones, rounded up). */
export function resourceShortfall(cost, available) {
    const short = {};
    if (!cost || !available)
        return short;
    for (const key of RING_RESOURCE_KEYS) {
        const need = cost[key] ?? 0;
        if (need > available[key])
            short[key] = Math.ceil(need - available[key]);
    }
    return short;
}
/** Soonest completion among orders that are under construction, or null when none reports a time. */
export function nextSlotFreeInSeconds(queue) {
    let soonest = null;
    for (const order of queue) {
        if (order.state !== 'building' || order.completesInSeconds === null)
            continue;
        soonest = soonest === null ? order.completesInSeconds : Math.min(soonest, order.completesInSeconds);
    }
    return soonest === null ? null : Math.max(0, soonest);
}
/**
 * Prerequisites (all required) not yet met, judged on the settlement's
 * highest level of each type — mirrors `Settlement.HighestLevelOf`.
 */
export function missingPrerequisites(prerequisites, highestLevels) {
    return (prerequisites ?? []).filter((p) => (highestLevels[p.type] ?? 0) < p.level).map((p) => ({ type: p.type, level: p.level }));
}
export function computeAvailability(input) {
    const { construction } = input;
    const free = Math.max(0, construction.slots - construction.slotsUsed);
    const slotsShort = !!input.hexBusy || input.slotsNeeded > free;
    const queueHasRoom = construction.maxWaitingOrders > 0 && construction.waitingOrders < construction.maxWaitingOrders;
    const shortfall = resourceShortfall(input.cost, input.available);
    const resourcesShort = Object.keys(shortfall).length > 0;
    let state = 'ready';
    if (input.locked)
        state = 'locked';
    else if (resourcesShort)
        state = 'waiting';
    else if (slotsShort)
        state = queueHasRoom ? 'queues' : 'waiting';
    return {
        state,
        shortfall,
        slots: { needed: input.slotsNeeded, total: construction.slots, free, short: slotsShort },
        queue: { hasRoom: queueHasRoom, waiting: construction.waitingOrders, max: construction.maxWaitingOrders },
        nextSlotFreeInSeconds: slotsShort ? nextSlotFreeInSeconds(input.queue) : null,
    };
}
/** Whether a click on a bubble in this state may go through. */
export function isActionable(state) {
    return state === undefined || state === 'ready' || state === 'queues';
}

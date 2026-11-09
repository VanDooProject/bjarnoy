export const PENDING_ORDER_PREFIX = 'pending:';
let sequence = 0;
/**
 * A `waiting`-state order with no timing: exactly what `constructionDialsFromQueue` renders as "…". A raze stand-in carries
 * the level the building has after the raze.
 */
export function makePendingOrder(building, at, kind = 'build', targetLevel = 1) {
    sequence += 1;
    return {
        id: `${PENDING_ORDER_PREFIX}${sequence}`,
        q: at.q,
        r: at.r,
        building,
        kind,
        targetLevel,
        state: 'waiting',
        slotCost: 1,
        completesAtGameTime: null,
        completesInSeconds: null,
        totalSeconds: 0,
    };
}
export function isPendingOrder(order) {
    return order.id.startsWith(PENDING_ORDER_PREFIX);
}
/**
 * The level an upgrade of the building on `at` queues: one above the highest level it already has (`builtLevel`) or is
 * already being built to (once stacking is switched on, an upgrade can queue behind a running one). The ring's Upgrade
 * card and the optimistic order both read it, so they agree with the order the server creates.
 */
export function nextUpgradeLevel(builtLevel, queue, at) {
    const queued = queue.filter((o) => o.q === at.q && o.r === at.r && (o.kind ?? 'build') === 'build').map((o) => o.targetLevel);
    return Math.max(builtLevel, ...queued) + 1;
}
/**
 * Whether the hex on `at` takes no further order: it already holds `maxOrdersPerHex` orders (1 today, stacking is gated
 * off, docs/design/construction-slots.md) or a raze. The server refuses an upgrade there with `AlreadyQueuedOnHex`.
 */
export function hexTakesNoOrder(queue, at, maxOrdersPerHex) {
    const here = queue.filter((o) => o.q === at.q && o.r === at.r);
    return here.length >= maxOrdersPerHex || here.some((o) => o.kind === 'raze');
}

export const PENDING_ORDER_PREFIX = 'pending:';
let sequence = 0;
/** A `waiting`-state order with no timing: exactly what `constructionDialsFromQueue` renders as "…". */
export function makePendingOrder(building, at) {
    sequence += 1;
    return {
        id: `${PENDING_ORDER_PREFIX}${sequence}`,
        q: at.q,
        r: at.r,
        building,
        targetLevel: 1,
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

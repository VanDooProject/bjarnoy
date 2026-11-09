/**
 * A client-only stand-in for a build order the server has not answered yet
 * (W3 optimistic build). It sits in `hud.queue` so the construction dial on
 * the hex shows "…" at once; the real order replaces it when the refresh
 * lands, and a refusal removes it again. It is never shown as a queue row.
 */
import type { BuildOrderResponse } from '../../api/types';
import type { AxialCoord } from '../hex/coords';

export const PENDING_ORDER_PREFIX = 'pending:';

let sequence = 0;

/**
 * A `waiting`-state order with no timing: exactly what `constructionDialsFromQueue` renders as "…". A raze stand-in carries
 * the level the building has after the raze.
 */
export function makePendingOrder(
  building: string,
  at: AxialCoord,
  kind: BuildOrderResponse['kind'] = 'build',
  targetLevel = 1,
): BuildOrderResponse {
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

export function isPendingOrder(order: Pick<BuildOrderResponse, 'id'>): boolean {
  return order.id.startsWith(PENDING_ORDER_PREFIX);
}

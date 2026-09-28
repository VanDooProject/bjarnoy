import type { Router, RouteLocationRaw } from 'vue-router';
import { modalLocation } from './modalRoute';

/**
 * The profile (own or someone else's), as a modal location — see
 * `modalRoute.ts`'s `modalLocation` for the shared background-stashing/
 * modal-to-modal-reuse behavior this is a thin wrapper over. Kept as its own
 * named export (rather than inlining `modalLocation` calls at every call
 * site) since "open a profile" is by far the most common caller.
 */
export function profileLocation(router: Router, userName?: string): RouteLocationRaw {
  return modalLocation(router, userName ? `/profile/${userName}` : '/profile');
}

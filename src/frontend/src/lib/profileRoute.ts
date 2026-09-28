import type { Router, RouteLocationRaw } from 'vue-router';
import { modalLocation } from './modalRoute';

/**
 * Builds the `RouteLocationRaw` for opening a profile as a modal over
 * whatever page is currently showing — a thin wrapper around
 * `modalLocation()` (see lib/modalRoute.ts and App.vue's background-route
 * pattern) that only adds the profile path's own `/profile[/:userName]`
 * shape.
 */
export function profileLocation(router: Router, userName?: string): RouteLocationRaw {
  return modalLocation(router, userName ? `/profile/${userName}` : '/profile');
}

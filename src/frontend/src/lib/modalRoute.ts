import type { Router, RouteLocationRaw } from 'vue-router';

/**
 * Every route that renders as a modal over whatever page was showing before
 * — see App.vue's background-route pattern and RouteModal.vue's dialog
 * chrome. `own-profile`/`profile` were the first (ProfileModal.vue);
 * `leaderboards`/`guild` and the battle-reports inbox (`reports`/
 * `report-detail`) reuse the exact same pattern instead of rendering as
 * full pages through `<router-view>`.
 */
export const MODAL_ROUTE_NAMES = ['own-profile', 'profile', 'leaderboards', 'guild', 'reports', 'report-detail'] as const;

export type ModalRouteName = (typeof MODAL_ROUTE_NAMES)[number];

export function isModalRouteName(name: unknown): name is ModalRouteName {
  return typeof name === 'string' && (MODAL_ROUTE_NAMES as readonly string[]).includes(name);
}

/**
 * Builds the `RouteLocationRaw` for opening `path` as a modal over whatever
 * page is currently showing (see App.vue's background-route pattern). The
 * current route's full path is stashed in `history.state.backgroundView` so
 * App.vue knows what to keep rendering underneath, and the modal component
 * knows what to return to on close.
 *
 * If the caller is already on any modal route, that route's own
 * `backgroundView` is reused instead of stashing the modal route itself —
 * otherwise a modal-to-modal navigation (e.g. profile -> leaderboards)
 * would stack a modal behind another modal once the first one closes.
 */
export function modalLocation(router: Router, path: string): RouteLocationRaw {
  const current = router.currentRoute.value;
  const onModalRoute = isModalRouteName(current.name);
  // Read via the router's own history object (not the global `window.
  // history`) so this also works against a `createMemoryHistory` router in
  // tests, which keeps its state internally rather than in the real
  // browser history.
  const currentState = router.options.history.state as { backgroundView?: unknown };
  const backgroundView = onModalRoute
    ? typeof currentState.backgroundView === 'string'
      ? currentState.backgroundView
      : undefined
    : current.fullPath;

  return {
    path,
    state: backgroundView ? { backgroundView } : undefined,
  };
}

/**
 * The reports inbox (the list, or one report's detail) as a modal location
 * — see `modalLocation`. List -> detail and back stay on modal routes, so
 * they keep the original background rather than stacking the list behind
 * the detail.
 */
export function reportsLocation(router: Router, reportId?: string): RouteLocationRaw {
  return modalLocation(router, reportId ? `/reports/${reportId}` : '/reports');
}

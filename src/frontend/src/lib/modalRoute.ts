import type { Router, RouteLocationRaw } from 'vue-router';

/**
 * Every route name that renders as a modal over a background route (see
 * App.vue's own comment on the pattern) rather than through the single
 * `<router-view>` directly. `profileLocation`/`reportsLocation` below stash
 * `history.state.backgroundView` when navigating *to* one of these, and the
 * "already on a modal route" branch of `modalLocation` reuses that stashed
 * background instead of stacking a modal behind another modal — this list
 * is what tells that branch which routes count as "a modal route" in the
 * first place, so any future modal route (e.g. a settings-only deep link)
 * just adds its name here.
 */
export const MODAL_ROUTE_NAMES = ['own-profile', 'profile', 'reports', 'report-detail'] as const;

export function isModalRouteName(name: unknown): boolean {
  return MODAL_ROUTE_NAMES.includes(name as (typeof MODAL_ROUTE_NAMES)[number]);
}

/**
 * Builds the `RouteLocationRaw` for opening `path` as a modal over whatever
 * page is currently showing (see App.vue's background-route pattern). The
 * current route's full path is stashed in `history.state.backgroundView` so
 * App.vue knows what to keep rendering underneath, and the modal's own
 * ModalShell.vue knows what to return to on close.
 *
 * If the caller is already on *any* modal route (own-profile/profile,
 * reports/report-detail), that route's own `backgroundView` is reused
 * instead of stashing the modal route itself — otherwise a modal-to-modal
 * navigation (profile → reports, or reports list → detail) would stack a
 * modal behind another modal once the first one closes.
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

/** The reports inbox (list, or a specific report's detail), as a modal location — see `modalLocation`. */
export function reportsLocation(router: Router, reportId?: string): RouteLocationRaw {
  return modalLocation(router, reportId ? `/reports/${reportId}` : '/reports');
}

import type { Router, RouteLocationRaw } from 'vue-router';

/**
 * Builds the `RouteLocationRaw` for opening a profile as a modal over
 * whatever page is currently showing (see App.vue's background-route
 * pattern). The current route's full path is stashed in `history.state.
 * backgroundView` so App.vue knows what to keep rendering underneath, and
 * ProfileModal.vue knows what to return to on close.
 *
 * If the caller is already on a profile route (own or someone else's), that
 * route's own `backgroundView` is reused instead of stashing the profile
 * route itself — otherwise a profile-to-profile navigation would stack a
 * profile modal behind another profile modal once the first one closes.
 */
export function profileLocation(router: Router, userName?: string): RouteLocationRaw {
  const current = router.currentRoute.value;
  const onProfileRoute = current.name === 'own-profile' || current.name === 'profile';
  // Read via the router's own history object (not the global `window.
  // history`) so this also works against a `createMemoryHistory` router in
  // tests, which keeps its state internally rather than in the real
  // browser history.
  const currentState = router.options.history.state as { backgroundView?: unknown };
  const backgroundView = onProfileRoute
    ? typeof currentState.backgroundView === 'string'
      ? currentState.backgroundView
      : undefined
    : current.fullPath;

  return {
    path: userName ? `/profile/${userName}` : '/profile',
    state: backgroundView ? { backgroundView } : undefined,
  };
}

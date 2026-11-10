import { inject, type Ref } from 'vue';
import { routerViewLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * The route the enclosing `<router-view>` renders, not the app's current
 * route. They differ while a modal route is open (App.vue's background-route
 * pattern): the URL is `/reports` but the view underneath still renders
 * `/settlement#world`. A view that reads its own path or hash (MapView's
 * world/settlement mode) must read this one, or opening a modal switches it.
 */
export function useDisplayedRoute(): Readonly<Ref<RouteLocationNormalizedLoaded>> {
  // The router provides this app-wide too (the current route), and each
  // <router-view> overrides it with the route it renders.
  const displayed = inject(routerViewLocationKey, null);
  if (!displayed) throw new Error('useDisplayedRoute() needs an installed router');
  return displayed;
}

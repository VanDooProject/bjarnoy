/**
 * Settlement view and world map share one route (`/settlement`, MapView.vue)
 * and the player switches between them by zooming. This hash marks world
 * mode in the URL, so back/forward, a reload and the e2e suite all agree on
 * which mode is showing.
 */
export const WORLD_HASH = '#world';

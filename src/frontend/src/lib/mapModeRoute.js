/**
 * Settlement view and world map share one route (`/settlement`, MapView.vue)
 * and the player switches between them by zooming. This hash marks world
 * mode in the URL, so back/forward, a reload and the e2e suite all agree on
 * which mode is showing. Once the camera has moved, the camera anchor
 * (lib/mapCameraHash.ts) follows it: `#world&q=<int>&r=<int>&z=<zoom>`.
 */
export const WORLD_HASH = '#world';
/** Whether `hash` marks world mode: the bare marker, or the marker followed by a camera anchor. */
export function isWorldHash(hash) {
    return hash === WORLD_HASH || hash.startsWith(`${WORLD_HASH}&`);
}

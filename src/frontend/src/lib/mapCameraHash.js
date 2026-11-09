const INTEGER = /^-?\d+$/;
const WORLD_PREFIX = '#world&';
export function serializeCameraHash(view, world = false) {
    return `${world ? WORLD_PREFIX : '#'}q=${view.coord.q}&r=${view.coord.r}&z=${view.zoom.toFixed(2)}`;
}
/** Null for a missing or malformed hash. */
export function parseCameraHash(hash) {
    if (!hash.startsWith('#'))
        return null;
    const params = new URLSearchParams(hash.startsWith(WORLD_PREFIX) ? hash.slice(WORLD_PREFIX.length) : hash.slice(1));
    const q = params.get('q');
    const r = params.get('r');
    const z = params.get('z');
    if (q === null || r === null || z === null || !INTEGER.test(q) || !INTEGER.test(r))
        return null;
    const zoom = Number(z);
    if (z.trim() === '' || !Number.isFinite(zoom) || zoom <= 0)
        return null;
    return { coord: { q: Number(q), r: Number(r) }, zoom };
}
/** World-mode zoom for "show me this spot": close enough to read a hex, below the zoom that flips to the settlement view (zoomTransition.ts). */
export const WORLD_FOCUS_ZOOM = 0.35;
/** The map route centred on `coord` in world mode — what a "show on map" link points at. */
export function worldMapLocation(coord) {
    return { path: '/settlement', hash: serializeCameraHash({ coord, zoom: WORLD_FOCUS_ZOOM }, true) };
}

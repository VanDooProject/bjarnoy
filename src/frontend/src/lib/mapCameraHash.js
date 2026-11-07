const INTEGER = /^-?\d+$/;
export function serializeCameraHash(view) {
    return `#q=${view.coord.q}&r=${view.coord.r}&z=${view.zoom.toFixed(2)}`;
}
/** Null for a missing or malformed hash. */
export function parseCameraHash(hash) {
    if (!hash.startsWith('#'))
        return null;
    const params = new URLSearchParams(hash.slice(1));
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

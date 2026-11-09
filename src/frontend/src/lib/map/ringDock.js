/** Height the bottom strip is given room for (the ring keeps clear of it). */
export const DOCK_BOTTOM_H = 236;
/** Width of the landscape side panel. */
export const DOCK_SIDE_W = 248;
/** Gap between a dock and the screen edge / the ring. */
export const DOCK_GAP = 8;
/** Where the card docks, or null for the floating desktop card. */
export function ringDockFor({ compact, width, height, x, insetLeft = 0 }) {
    if (!compact)
        return null;
    if (height >= width)
        return 'bottom';
    // Landscape: the side with more room, which is the side away from the hex.
    return width - x >= x - insetLeft ? 'right' : 'left';
}
/**
 * The ring's bounds shrunk so the ring stays clear of the dock. Falls back to
 * the original bounds when what is left would be too small to hold a ring at
 * all — a ring overlapping the dock beats a ring squeezed into nothing.
 */
export function boundsClearOfDock(bounds, dock, stage, minSize = 180) {
    if (!dock)
        return bounds;
    const next = { ...bounds };
    if (dock === 'bottom')
        next.bottom = Math.min(bounds.bottom, stage.height - (stage.insetBottom ?? 0) - DOCK_BOTTOM_H - DOCK_GAP);
    if (dock === 'right')
        next.right = Math.min(bounds.right, stage.width - DOCK_SIDE_W - 2 * DOCK_GAP);
    if (dock === 'left')
        next.left = Math.max(bounds.left, (stage.insetLeft ?? 0) + DOCK_SIDE_W + 2 * DOCK_GAP);
    if (next.right - next.left < minSize || next.bottom - next.top < minSize)
        return bounds;
    return next;
}
/**
 * One tap on a bubble: a tap on the bubble that is already armed commits it,
 * a tap on any other bubble moves the arm there (and does not commit).
 */
export function tapArm(armed, id) {
    return armed === id ? { armed: id, commit: true } : { armed: id, commit: false };
}

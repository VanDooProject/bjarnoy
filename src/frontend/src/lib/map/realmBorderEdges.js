export function splitBorderEdges(edges) {
    const back = [];
    const front = [];
    for (const edge of edges)
        (edge[0] < 3 ? back : front).push(edge);
    return { back, front };
}
/**
 * How far a realm's border line sits inside its own outermost hexes, as a fraction of the centre-to-corner distance. Two realms that
 * touch then each draw their line inside their own hex, side by side, instead of both stroking the one shared hex edge (where only the
 * colour drawn last would show). 0.05 puts the 2.5px solid strokes of two neighbours about 4px apart at the default settlement zoom.
 */
export const BORDER_INSET = 0.05;
/**
 * The corners of a hex's border line, pulled into the hex: `top` are the hex's six `isoTopPoints()` corners on screen, `ownedAcrossEdge[i]`
 * whether the neighbour across edge `i` (corner `i` to `i + 1`) belongs to the same realm. Corner `k` lies between edge `k - 1` and edge `k`:
 *
 * - neither of those neighbours is the realm's (a convex corner): it moves towards the hex centre,
 * - exactly one is (a concave corner): it moves away from the centre of the one that is not, so the line follows the realm's outline,
 * - both are: no outer edge uses it, `null`.
 *
 * The iso projection is affine, so these moves keep their ratios in screen space; a neighbour's centre is the hex centre mirrored over
 * the shared edge's midpoint.
 */
export function insetBorderCorners(top, ownedAcrossEdge, inset = BORDER_INSET) {
    const centre = {
        x: top.reduce((sum, p) => sum + p.x, 0) / top.length,
        y: top.reduce((sum, p) => sum + p.y, 0) / top.length,
    };
    const neighbourCentre = (edge) => {
        const a = top[edge];
        const b = top[(edge + 1) % 6];
        return { x: a.x + b.x - centre.x, y: a.y + b.y - centre.y };
    };
    return top.map((v, k) => {
        const before = (k + 5) % 6;
        const ownedBefore = ownedAcrossEdge[before];
        const ownedAfter = ownedAcrossEdge[k];
        if (ownedBefore && ownedAfter)
            return null;
        if (!ownedBefore && !ownedAfter)
            return { x: v.x + inset * (centre.x - v.x), y: v.y + inset * (centre.y - v.y) };
        const outside = neighbourCentre(ownedBefore ? k : before);
        return { x: v.x + inset * (v.x - outside.x), y: v.y + inset * (v.y - outside.y) };
    });
}

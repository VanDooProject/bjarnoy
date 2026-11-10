/**
 * Which of a claimed hex's outer border edges draw below its topping and which
 * above it.
 *
 * `isoTopPoints()` corners are 0 left, 1 top-left, 2 top-right, 3 right,
 * 4 bottom-right, 5 bottom-left, and edge `i` runs from corner `i` to corner
 * `i + 1`. Edges 0, 1, 2 (upper-left, top, upper-right) are the hex's back: the
 * tall art standing on the hex covers them, as it should. Edges 3, 4, 5
 * (lower-right, bottom, lower-left) are its front: they are on the near side of
 * whatever stands on the hex, so they draw over it (but still under the toppings
 * of the hexes in front — the renderer sorts them by depth key).
 */
export interface BorderEdgeSplit {
  back: [number, number][];
  front: [number, number][];
}

export function splitBorderEdges(edges: readonly [number, number][]): BorderEdgeSplit {
  const back: [number, number][] = [];
  const front: [number, number][] = [];
  for (const edge of edges) (edge[0] < 3 ? back : front).push(edge);
  return { back, front };
}

/**
 * How far a realm's border line sits inside its own outermost hexes, as a fraction of the centre-to-corner distance. Two realms that
 * touch then each draw their line inside their own hex, side by side, instead of both stroking the one shared hex edge (where only the
 * colour drawn last would show). 0.05 puts the 2.5px solid strokes of two neighbours about 4px apart at the default settlement zoom.
 */
export const BORDER_INSET = 0.05;

interface Pt {
  x: number;
  y: number;
}

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
export function insetBorderCorners(top: readonly Pt[], ownedAcrossEdge: readonly boolean[], inset: number = BORDER_INSET): (Pt | null)[] {
  const centre = {
    x: top.reduce((sum, p) => sum + p.x, 0) / top.length,
    y: top.reduce((sum, p) => sum + p.y, 0) / top.length,
  };
  const neighbourCentre = (edge: number): Pt => {
    const a = top[edge];
    const b = top[(edge + 1) % 6];
    return { x: a.x + b.x - centre.x, y: a.y + b.y - centre.y };
  };

  return top.map((v, k) => {
    const before = (k + 5) % 6;
    const ownedBefore = ownedAcrossEdge[before];
    const ownedAfter = ownedAcrossEdge[k];
    if (ownedBefore && ownedAfter) return null;
    if (!ownedBefore && !ownedAfter) return { x: v.x + inset * (centre.x - v.x), y: v.y + inset * (centre.y - v.y) };
    const outside = neighbourCentre(ownedBefore ? k : before);
    return { x: v.x + inset * (v.x - outside.x), y: v.y + inset * (v.y - outside.y) };
  });
}

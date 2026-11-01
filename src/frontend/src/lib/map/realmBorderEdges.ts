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

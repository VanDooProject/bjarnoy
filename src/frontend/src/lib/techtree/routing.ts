// Turns the dependency graph into orthogonal link geometry.
//
// Three rules, all from the design:
//   1. A building that feeds several others emits ONE trunk — a stub right, a
//      single vertical run, then a short branch per target — instead of a
//      parallel line per target.
//   2. Every source gets its OWN vertical lane inside the column gutter, so
//      two unrelated branches never share an x and read as one broken line.
//   3. No line ever passes over a card. Rows are laid out (see layout.ts) so
//      most links are a single horizontal run; anything that would cross a
//      card drops to the reserved lane below the grid instead.
//
// Each emitted segment carries the edge keys whose branch actually routes
// through it, so hovering a card can light exactly the run its own chain
// uses and stop where the chain does.
import { edgeKey, type EdgeKey, type TechGraph } from './graph';
import {
  BYPASS_Y,
  CARD_H,
  CARD_W,
  LANE_OFFSET,
  LANE_STEP,
  columnX,
  rowMid,
  rowY,
  type Slot,
} from './layout';

export type Point = readonly [x: number, y: number];

export interface RoutedSegment {
  points: readonly Point[];
  /** The edges whose route runs through this segment. */
  keys: readonly EdgeKey[];
}

export type Layout = Readonly<Record<string, Slot>>;

/** `M x y L x y …` for an SVG path. */
export const pathD = (points: readonly Point[]): string =>
  `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')}`;

/**
 * Whether a horizontal run at `y` from `x0` to `x1` would pass over any card.
 * Only cards in the run's own row can qualify, since `y` is always a row's
 * vertical centre.
 */
export function crossesCard(layout: Layout, y: number, x0: number, x1: number): boolean {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  return Object.values(layout).some(([col, row]) => {
    const top = rowY(row);
    if (y <= top || y >= top + CARD_H) return false;
    const cardLeft = columnX(col);
    return right > cardLeft && left < cardLeft + CARD_W;
  });
}

/**
 * One vertical lane per source per gutter. Lanes are handed out in a stable
 * order (see `sourceOrder`) so the same graph always draws the same picture
 * and the geometry can be asserted in tests.
 */
function laneAllocator() {
  const used = new Map<number, number>();
  return (gutterCol: number): number => {
    const n = used.get(gutterCol) ?? 0;
    used.set(gutterCol, n + 1);
    return columnX(gutterCol) + CARD_W + LANE_OFFSET + n * LANE_STEP;
  };
}

/** Column, then row, then name — the order lanes are assigned in. */
function sourceOrder(layout: Layout, types: readonly string[]): string[] {
  return [...types].sort((a, b) => {
    const [aCol, aRow] = layout[a]!;
    const [bCol, bRow] = layout[b]!;
    return aCol - bCol || aRow - bRow || a.localeCompare(b);
  });
}

/**
 * Routes every edge of `graph` whose endpoints are both laid out. Returns the
 * segments to draw, in no particular order — each one already tagged with the
 * edges it serves.
 */
export function routeEdges(layout: Layout, graph: TechGraph): RoutedSegment[] {
  const placed = (type: string) => layout[type] !== undefined;
  const colOf = (type: string) => layout[type]![0];
  const midOf = (type: string) => rowMid(layout[type]![1]);
  const leftOf = (type: string) => columnX(colOf(type));
  const rightOf = (type: string) => columnX(colOf(type)) + CARD_W;

  const segments: RoutedSegment[] = [];
  const nextLane = laneAllocator();

  // The final flat hop of every adjacent edge, keyed so a same-row distant
  // edge can find and extend it instead of drawing its own line — see
  // `reuseSameRowChain` below.
  const leafSegmentByEdge = new Map<EdgeKey, RoutedSegment>();

  // An edge spanning more than one column can't use its source's trunk (that
  // only reaches the next column), so it gets its own run into a lane
  // reserved for the target — shared by every long edge arriving there, since
  // they genuinely converge on the same card.
  const approachLanes = new Map<string, number>();
  const approachLane = (target: string): number => {
    const existing = approachLanes.get(target);
    if (existing !== undefined) return existing;
    const lane = nextLane(colOf(target) - 1);
    approachLanes.set(target, lane);
    return lane;
  };

  const adjacent = new Map<string, string[]>();
  const distant: { from: string; to: string }[] = [];
  for (const { from, to } of graph.edges) {
    if (!placed(from) || !placed(to)) continue;
    if (colOf(to) === colOf(from) + 1) {
      const list = adjacent.get(from);
      if (list) list.push(to);
      else adjacent.set(from, [to]);
    } else {
      distant.push({ from, to });
    }
  }

  for (const source of sourceOrder(layout, [...adjacent.keys()])) {
    const targets = adjacent.get(source)!;
    const sx = rightOf(source);
    const sy = midOf(source);
    const keys = targets.map((t) => edgeKey(source, t));

    // A lone target already at the source's height needs no trunk at all.
    if (targets.length === 1 && midOf(targets[0]!) === sy) {
      const segment: RoutedSegment = { points: [[sx, sy], [leftOf(targets[0]!), sy]], keys };
      segments.push(segment);
      leafSegmentByEdge.set(keys[0]!, segment);
      continue;
    }

    const trunkX = nextLane(colOf(source));
    segments.push({ points: [[sx, sy], [trunkX, sy]], keys });

    // The trunk is emitted per gap rather than as one line, each gap tagged
    // with only the branches that actually travel through it — so hovering a
    // card lights the vertical from its source down to itself and no further.
    const stops = [...new Set([sy, ...targets.map(midOf)])].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const top = stops[i]!;
      const bottom = stops[i + 1]!;
      const through = targets
        .filter((t) => Math.min(sy, midOf(t)) <= top && Math.max(sy, midOf(t)) >= bottom)
        .map((t) => edgeKey(source, t));
      if (through.length > 0) segments.push({ points: [[trunkX, top], [trunkX, bottom]], keys: through });
    }

    for (const target of targets) {
      const ty = midOf(target);
      const edge = edgeKey(source, target);
      const segment: RoutedSegment = { points: [[trunkX, ty], [leftOf(target), ty]], keys: [edge] };
      segments.push(segment);
      leafSegmentByEdge.set(edge, segment);
    }
  }

  /**
   * A distant edge whose source and target share a row, with every cell
   * between them filled by real intermediate nodes on the *same* chain (e.g.
   * Shrine of Freyja's own Farm and Pumpkin Farm prerequisites sit right next
   * to each other) doesn't need its own line at all: the hops already drawn
   * between those nodes — adjacent ones, or distant ones already routed
   * straight through an empty cell — trace the identical path. Extending
   * their `keys` instead of drawing a new one means hovering Farm lights the
   * exact same run hovering Pumpkin Farm does, one card further.
   *
   * Only edges already in `leafSegmentByEdge` count as a hop, so this only
   * ever reuses a line actually drawn, never a hypothetical one — and since
   * `distant` is processed shortest-span first, a nearer hop (e.g. Pumpkin
   * Farm -> Shrine of Freyja, two columns) is always routed, and so
   * available to reuse, before a farther edge over the same row (Farm ->
   * Shrine of Freyja, three columns) needs it.
   */
  function reuseSameRowChain(from: string, to: string): boolean {
    const y = midOf(from);
    if (midOf(to) !== y) return false;

    const hopSegments: RoutedSegment[] = [];
    let current = from;
    while (current !== to) {
      const next = graph.edges.find(
        (e) => e.from === current && placed(e.to) && midOf(e.to) === y && leafSegmentByEdge.has(edgeKey(e.from, e.to)),
      );
      if (!next) return false;
      hopSegments.push(leafSegmentByEdge.get(edgeKey(current, next.to))!);
      current = next.to;
    }

    const key = edgeKey(from, to);
    for (const segment of hopSegments) (segment.keys as EdgeKey[]).push(key);
    return true;
  }

  // Shortest span first, so a nearer hop a same-row chain might reuse is
  // always routed before the farther edge that wants to reuse it.
  const span = (edge: { from: string; to: string }) => colOf(edge.to) - colOf(edge.from);
  for (const { from, to } of distant.sort(
    (a, b) => span(a) - span(b) || colOf(a.from) - colOf(b.from) || a.to.localeCompare(b.to),
  )) {
    if (reuseSameRowChain(from, to)) continue;

    const key = edgeKey(from, to);
    const sx = rightOf(from);
    const sy = midOf(from);
    const tx = leftOf(to);
    const ty = midOf(to);

    // Straight through, when the layout has kept the cells between clear.
    if (sy === ty && !crossesCard(layout, sy, sx, tx)) {
      const segment: RoutedSegment = { points: [[sx, sy], [tx, ty]], keys: [key] };
      segments.push(segment);
      leafSegmentByEdge.set(key, segment);
      continue;
    }

    const ax = approachLane(to);
    if (!crossesCard(layout, sy, sx, ax) && !crossesCard(layout, ty, ax, tx)) {
      segments.push({ points: [[sx, sy], [ax, sy], [ax, ty], [tx, ty]], keys: [key] });
      continue;
    }

    // Blocked at one end or the other: go down under every card, across, and
    // back up into the target's approach lane.
    const exitX = nextLane(colOf(from));
    segments.push({
      points: [[sx, sy], [exitX, sy], [exitX, BYPASS_Y], [ax, BYPASS_Y], [ax, ty], [tx, ty]],
      keys: [key],
    });
  }

  return segments;
}

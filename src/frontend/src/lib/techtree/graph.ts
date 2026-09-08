// The dependency graph itself: who needs whom, and what a hover lights up.
// Pure — no Vue, no DOM — so the traversal rules can be tested directly.
import { ANCHOR } from './layout';

/** `${from}>${to}`, the identity of one edge. */
export type EdgeKey = string;

export const edgeKey = (from: string, to: string): EdgeKey => `${from}>${to}`;

export interface PrereqEdge {
  /** The building that must already stand. */
  from: string;
  /** The building it unlocks. */
  to: string;
}

export interface TechGraph {
  /** What each building needs. */
  parents: ReadonlyMap<string, readonly string[]>;
  /** What each building unlocks. */
  children: ReadonlyMap<string, readonly string[]>;
  edges: readonly PrereqEdge[];
}

/**
 * Builds the graph over `types`, from real catalogue prerequisites plus the
 * derived anchor edges: any building with no prerequisite of its own hangs
 * off the longhouse, so no card floats unconnected. Prerequisites naming a
 * building outside `types` (one hidden from the docs, say) are dropped, and
 * so is the anchor's own edge to itself.
 */
export function buildGraph(
  types: readonly string[],
  prerequisitesOf: (type: string) => readonly { type: string; level: number }[],
): TechGraph {
  const present = new Set(types);
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const edges: PrereqEdge[] = [];

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  const link = (from: string, to: string) => {
    edges.push({ from, to });
    push(parents, to, from);
    push(children, from, to);
  };

  for (const type of types) {
    const real = prerequisitesOf(type).filter((p) => present.has(p.type) && p.type !== type);
    if (real.length > 0) {
      for (const prerequisite of real) link(prerequisite.type, type);
    } else if (type !== ANCHOR && present.has(ANCHOR)) {
      link(ANCHOR, type);
    }
  }

  return { parents, children, edges };
}

function reachable(
  from: string,
  step: ReadonlyMap<string, readonly string[]>,
  out: Set<string>,
): Set<string> {
  for (const next of step.get(from) ?? []) {
    if (out.has(next)) continue;
    out.add(next);
    reachable(next, step, out);
  }
  return out;
}

/** Everything `type` needs, directly or through a chain. Excludes `type` itself. */
export function ancestorsOf(graph: TechGraph, type: string): Set<string> {
  return reachable(type, graph.parents, new Set());
}

/** Everything that needs `type`, directly or through a chain. Excludes `type` itself. */
export function descendantsOf(graph: TechGraph, type: string): Set<string> {
  return reachable(type, graph.children, new Set());
}

export interface HoverSets {
  /** The hovered building and everything it needs — drawn full strength. */
  up: Set<string>;
  /** What it leads to — drawn half-lit, so the direction of travel stays visible. */
  down: Set<string>;
  upKeys: Set<EdgeKey>;
  downKeys: Set<EdgeKey>;
}

/**
 * What one hovered card lights. Prerequisites go gold, descendants stay
 * half-visible, and an edge belongs to whichever of the two sides has both
 * of its ends in it.
 */
export function hoverSets(graph: TechGraph, hovered: string | null): HoverSets {
  if (!hovered) {
    return { up: new Set(), down: new Set(), upKeys: new Set(), downKeys: new Set() };
  }

  const up = ancestorsOf(graph, hovered);
  up.add(hovered);
  const down = descendantsOf(graph, hovered);

  const upKeys = new Set<EdgeKey>();
  const downKeys = new Set<EdgeKey>();
  for (const { from, to } of graph.edges) {
    if (up.has(from) && up.has(to)) upKeys.add(edgeKey(from, to));
    else if (down.has(to) && (from === hovered || down.has(from))) downKeys.add(edgeKey(from, to));
  }

  return { up, down, upKeys, downKeys };
}

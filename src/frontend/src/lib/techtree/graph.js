// The dependency graph itself: who needs whom, and what a hover lights up.
// Pure — no Vue, no DOM — so the traversal rules can be tested directly.
import { ANCHOR } from './layout';
export const edgeKey = (from, to) => `${from}>${to}`;
/**
 * Builds the graph over `types`, from real catalogue prerequisites plus the
 * derived anchor edges: any building with no prerequisite of its own hangs
 * off the longhouse, so no card floats unconnected. Prerequisites naming a
 * building outside `types` (one hidden from the docs, say) are dropped, and
 * so is the anchor's own edge to itself.
 */
export function buildGraph(types, prerequisitesOf) {
    const present = new Set(types);
    const parents = new Map();
    const children = new Map();
    const edges = [];
    const push = (map, key, value) => {
        const list = map.get(key);
        if (list)
            list.push(value);
        else
            map.set(key, [value]);
    };
    const link = (from, to) => {
        edges.push({ from, to });
        push(parents, to, from);
        push(children, from, to);
    };
    for (const type of types) {
        const real = prerequisitesOf(type).filter((p) => present.has(p.type) && p.type !== type);
        if (real.length > 0) {
            for (const prerequisite of real)
                link(prerequisite.type, type);
        }
        else if (type !== ANCHOR && present.has(ANCHOR)) {
            link(ANCHOR, type);
        }
    }
    return { parents, children, edges };
}
function reachable(from, step, out) {
    for (const next of step.get(from) ?? []) {
        if (out.has(next))
            continue;
        out.add(next);
        reachable(next, step, out);
    }
    return out;
}
/** Everything `type` needs, directly or through a chain. Excludes `type` itself. */
export function ancestorsOf(graph, type) {
    return reachable(type, graph.parents, new Set());
}
/** Everything that needs `type`, directly or through a chain. Excludes `type` itself. */
export function descendantsOf(graph, type) {
    return reachable(type, graph.children, new Set());
}
/**
 * What one hovered card lights. Prerequisites go gold, descendants stay
 * half-visible, and an edge belongs to whichever of the two sides has both
 * of its ends in it.
 */
export function hoverSets(graph, hovered) {
    if (!hovered) {
        return { up: new Set(), down: new Set(), upKeys: new Set(), downKeys: new Set() };
    }
    const up = ancestorsOf(graph, hovered);
    up.add(hovered);
    const down = descendantsOf(graph, hovered);
    const upKeys = new Set();
    const downKeys = new Set();
    for (const { from, to } of graph.edges) {
        if (up.has(from) && up.has(to))
            upKeys.add(edgeKey(from, to));
        else if (down.has(to) && (from === hovered || down.has(from)))
            downKeys.add(edgeKey(from, to));
    }
    return { up, down, upKeys, downKeys };
}

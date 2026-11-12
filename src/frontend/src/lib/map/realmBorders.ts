// Which hexes draw a realm border and which of their edges are stroked, as pure lookups over the world model so the renderer
// (HexMapRenderer.rebuildBorders) and its tests share one implementation.
import { neighbors, type AxialCoord } from '../hex/coords';

/** The slice of `WorldModel` the border rules read. */
export interface RealmBorderSource {
  realmBorderOwnerAt(q: number, r: number): string | undefined;
  isRivalRealm(settlementId: string): boolean;
  isExplored(q: number, r: number): boolean;
  isRivalDataVisible(q: number, r: number): boolean;
}

/**
 * The settlement whose realm border is drawn on this hex, or undefined when none is. With the fog on, the player's own realm shows
 * on explored ground (`isExplored`, the gameplay check) and a rival's wherever the mist is not fully opaque (`isRivalDataVisible`):
 * the part of the rival's realm you can see through the mist is drawn, not just what lies on the explored edge.
 */
export function shownBorderOwner(source: RealmBorderSource, q: number, r: number, fogActive: boolean): string | undefined {
  const owner = source.realmBorderOwnerAt(q, r);
  if (owner === undefined || !fogActive) return owner;
  const shown = source.isRivalRealm(owner) ? source.isRivalDataVisible(q, r) : source.isExplored(q, r);
  return shown ? owner : undefined;
}

// isoTopPoints()'s 6 corners (P0..P5) form edges [P0,P1],[P1,P2],...,[P5,P0]; this maps each `neighbors()` direction index to the
// corner-index pair of the one edge that faces that neighbour (from each direction's screen-space offset against each edge's outward
// normal). Used so only the realm's true outer edges get a border stroke, not every claimed hex's full hexagon outline.
const EDGE_FOR_DIR = [3, 2, 1, 0, 5, 4];

/** Per edge (corner `i` to `i + 1` of isoTopPoints()), whether the neighbour across it belongs to the same realm. */
export function ownedAcrossEdges(source: Pick<RealmBorderSource, 'realmBorderOwnerAt'>, c: AxialCoord, ownerId: string): boolean[] {
  const owned: boolean[] = new Array(6).fill(false);
  neighbors(c).forEach((n, i) => {
    owned[EDGE_FOR_DIR[i]] = source.realmBorderOwnerAt(n.q, n.r) === ownerId;
  });
  return owned;
}

/** Corner-index pairs (into isoTopPoints()) of a claimed hex's edges that face an unclaimed/rival neighbour. */
export function outerEdgesOf(ownedAcrossEdge: readonly boolean[]): [number, number][] {
  const edges: [number, number][] = [];
  ownedAcrossEdge.forEach((owned, edge) => {
    if (!owned) edges.push([edge, (edge + 1) % 6]);
  });
  return edges;
}

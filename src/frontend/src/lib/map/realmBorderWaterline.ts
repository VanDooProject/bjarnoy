// Realm-border geometry on the visible waterline. In the settlement view the sea art's top face starts lower than land's
// (`TILE_ART_SEA_TOPFACE_DROP_FRAC`), so on a coast a border drawn on the land-level grid floats off the water's edge. This module
// moves each border edge to the level the player actually sees and joins neighbouring edges that sit at different levels, as pure
// functions over a small source so the renderer (HexMapRenderer.rebuildBorders) and its tests share one implementation.
//
// The rules:
// - Edge `e` of a hex (corner `e` to `e + 1` of isoTopPoints()) drops by the sea drop when the hex in FRONT of it is lowered (sea):
//   edges 0..2 are the hex's back, so the hex itself is in front; edges 3..5 face the neighbour across them, which is in front.
// - At a grid corner three hexes meet. The frontmost one (F, highest isoDepthKey) draws last, so its two edges meet at its own level
//   dF; the third edge t, between the two hexes behind F, sits at its own drop dt:
//     dt == dF  both edges meet at corner + dF;
//     dt <  dF  (land behind, sea in front: a visible sand cliff) F's edges end at corner + dF, t at the corner, a vertical
//               connector between them;
//     dt >  dF  (sea behind, land F in front) t meets F's edge f1 it crosses at Q; f1 meets f2 at the corner. The line then runs on
//               to corner + dt, f2 ends at the corner, a connector joins them, and F's top face (undropped) hides whatever of t and
//               the connector lies on it. The wash tilts instead (corner to Q) so neighbouring washes still tessellate.
import type { AxialCoord } from '../hex/coords';
import { isoDepthKey, isoGridPosition, isoTopPoints } from '../hex/geometry';
import type { Pt } from './convexPolygon';
import { insetBorderCorners, isBackEdge } from './realmBorderEdges';
import { neighbourAcrossEdge, ownedAcrossEdges, type RealmBorderSource } from './realmBorders';
import { TILE_ART_SEA_TOPFACE_DROP_FRAC } from './textures';

/** What the geometry reads from the world: who owns a hex, and whether its art is drawn lowered (sea in settlement mode). */
export interface WaterlineBorderSource extends Pick<RealmBorderSource, 'realmBorderOwnerAt'> {
  isLowered(q: number, r: number): boolean;
}

/** One straight piece of a realm's border line. `clip` polygons (top faces of land in front) hide whatever of it lies on them. */
export interface BorderLinePiece {
  a: Pt;
  b: Pt;
  /** `back`: under the toppings, `front`: over its own hex's topping (edges 3..5 and the connectors at their start corner). */
  layer: 'back' | 'front';
  clip?: Pt[][];
}

export interface HexBorderGeometry {
  wash: Pt[];
  lines: BorderLinePiece[];
}

interface EdgeId {
  q: number;
  r: number;
  e: number;
}

interface CornerHex {
  c: AxialCoord;
  /** Which corner of this hex lies at the grid corner. */
  k: number;
  top: Pt[];
}

interface Corner {
  v: Pt;
  hexes: CornerHex[];
}

interface Join {
  /** Where edge 1 / edge 2 of the join stop. */
  end1: Pt;
  end2: Pt;
  /** The connector between the two ends, when they are not the same point. */
  link: [Pt, Pt] | null;
  /** Top face of the land in front that hides the lowered edge and the connector. */
  clip?: Pt[];
  clipEnd1?: boolean;
  clipEnd2?: boolean;
}

type JoinMode = 'clip' | 'tilt';

function sameEdge(a: EdgeId, b: EdgeId): boolean {
  return a.q === b.q && a.r === b.r && a.e === b.e;
}

/** One id for an edge however it is reached: the lesser of its two (hex, edge) names. */
function edgeId(c: AxialCoord, e: number): EdgeId {
  const n = neighbourAcrossEdge(c, e);
  const ne = (e + 3) % 6;
  const own = c.q < n.q || (c.q === n.q && (c.r < n.r || (c.r === n.r && e < ne)));
  return own ? { q: c.q, r: c.r, e } : { q: n.q, r: n.r, e: ne };
}

/**
 * The three hexes meeting at corner `k` of `c` (isoTopPoints() order), each with the index of that same corner in its own top face:
 * `c` itself and the neighbours across the edges before (`k - 1`) and after (`k`) the corner. Edge `e` of a hex is edge `e + 3` of the
 * neighbour across it, run the other way, so corner `e + 1` of the one is corner `e + 3` of the other and corner `e` is `e + 4`.
 */
export function hexesAtCorner(c: AxialCoord, k: number): { c: AxialCoord; k: number }[] {
  return [
    { c, k },
    { c: neighbourAcrossEdge(c, (k + 5) % 6), k: (k + 2) % 6 },
    { c: neighbourAcrossEdge(c, k), k: (k + 4) % 6 },
  ];
}

function intersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Whether `p` (on the segment's line) lies on segment a..b, with a small tolerance. */
function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return t >= -0.02 && t <= 1.02;
}

const down = (p: Pt, d: number): Pt => ({ x: p.x, y: p.y + d });

/**
 * Border geometry for hexes of one world: `tileW`/`tileH` are the top-face size the hexes are laid out with. Hold one instance per
 * rebuild; it caches per-hex lookups.
 */
export function createWaterlineBorders(source: WaterlineBorderSource, tileW: number, tileH: number) {
  const seaDrop = tileW * TILE_ART_SEA_TOPFACE_DROP_FRAC;
  const topCache = new Map<string, Pt[]>();
  const loweredCache = new Map<string, boolean>();

  const topOf = (c: AxialCoord): Pt[] => {
    const k = `${c.q},${c.r}`;
    let top = topCache.get(k);
    if (!top) {
      const grid = isoGridPosition(c, tileW, tileH);
      top = isoTopPoints(tileW, tileH).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      topCache.set(k, top);
    }
    return top;
  };
  const lowered = (c: AxialCoord): boolean => {
    const k = `${c.q},${c.r}`;
    let v = loweredCache.get(k);
    if (v === undefined) {
      v = source.isLowered(c.q, c.r);
      loweredCache.set(k, v);
    }
    return v;
  };
  const dropOf = (c: AxialCoord): number => (lowered(c) ? seaDrop : 0);
  /** Waterline rule: the hex in front of edge `e` of `c` decides. */
  const edgeDrop = (c: AxialCoord, e: number): number => dropOf(isBackEdge(e) ? c : neighbourAcrossEdge(c, e));

  const cornerAt = (c: AxialCoord, k: number): Corner => ({
    v: topOf(c)[k],
    hexes: hexesAtCorner(c, k).map((h) => ({ ...h, top: topOf(h.c) })),
  });

  const junction = (corner: Corner, e1: EdgeId, e2: EdgeId, mode: JoinMode): Join => {
    const { v, hexes } = corner;
    // No lowered hex at the corner means no edge there has a drop (an edge's front hex is one of the corner's three).
    if (!hexes.some((h) => lowered(h.c))) return { end1: v, end2: v, link: null };

    const F = hexes.reduce((a, b) => (isoDepthKey(b.c) > isoDepthKey(a.c) ? b : a));
    const fEdges = [(F.k + 5) % 6, F.k].map((e) => ({ id: edgeId(F.c, e), a: F.top[e], b: F.top[(e + 1) % 6] }));
    const dF = dropOf(F.c);

    // The third edge, between the two hexes behind F, with its drop and its far end.
    let tId: EdgeId | null = null;
    let tDrop = 0;
    let tFar = v;
    for (const h of hexes) {
      for (const e of [(h.k + 5) % 6, h.k]) {
        const id = edgeId(h.c, e);
        if (fEdges.some((f) => sameEdge(f.id, id))) continue;
        tId = id;
        tDrop = edgeDrop(h.c, e);
        tFar = e === (h.k + 5) % 6 ? h.top[e] : h.top[(e + 1) % 6];
      }
    }
    const isT = (id: EdgeId) => tId !== null && sameEdge(id, tId);

    if (tDrop === dF) {
      const p = down(v, dF);
      return { end1: p, end2: p, link: null };
    }
    if (tDrop < dF) {
      const vd = down(v, dF);
      if (!isT(e1) && !isT(e2)) return { end1: vd, end2: vd, link: null };
      const end1 = isT(e1) ? v : vd;
      const end2 = isT(e2) ? v : vd;
      return { end1, end2, link: [end1, end2] };
    }

    // t is lowered, F is not: t runs into F's outline at Q.
    const t1 = down(tFar, tDrop);
    const t2 = down(v, tDrop);
    let Q: Pt | null = null;
    let f1: (typeof fEdges)[number] | null = null;
    for (const f of fEdges) {
      const p = intersect(t1, t2, f.a, f.b);
      if (p && onSegment(p, f.a, f.b)) {
        Q = p;
        f1 = f;
      }
    }
    if (!Q || !f1) return { end1: v, end2: v, link: null };
    const kind = (id: EdgeId) => (isT(id) ? 't' : sameEdge(id, f1.id) ? 'f1' : 'f2');
    const k1 = kind(e1);
    const k2 = kind(e2);
    const tf2 = (k1 === 't' && k2 === 'f2') || (k1 === 'f2' && k2 === 't');
    if (tf2 && mode === 'clip') {
      // t runs on to its own corner and drops straight from the land line's corner; F's top face hides what lies on it.
      const vd = down(v, tDrop);
      const end1 = k1 === 't' ? vd : v;
      const end2 = k2 === 't' ? vd : v;
      return { end1, end2, link: [end1, end2], clip: F.top, clipEnd1: k1 === 't', clipEnd2: k2 === 't' };
    }
    const endOf = (k: string, other: string): Pt => (k === 't' ? Q : k === 'f1' ? (other === 't' ? Q : v) : v);
    const end1 = endOf(k1, k2);
    const end2 = endOf(k2, k1);
    return { end1, end2, link: tf2 ? [end1, end2] : null };
  };

  /** The wash polygon and border line pieces of `c`, whose realm is `ownerId`. */
  const hexGeometry = (c: AxialCoord, ownerId: string): HexBorderGeometry => {
    const top = topOf(c);
    const owned = ownedAcrossEdges(source, c, ownerId);
    const inset = insetBorderCorners(top, owned);

    const wash: Pt[] = [];
    for (let k = 0; k < 6; k++) {
      const j = junction(cornerAt(c, k), edgeId(c, (k + 5) % 6), edgeId(c, k), 'tilt');
      wash.push(j.end1);
      if (j.link) wash.push(j.link[1]);
    }

    const lines: BorderLinePiece[] = [];
    for (let e = 0; e < 6; e++) {
      if (owned[e]) continue;
      const layer = isBackEdge(e) ? 'back' : 'front';
      const self = edgeId(c, e);
      const ends = [e, (e + 1) % 6].map((k) => {
        const corner = cornerAt(c, k);
        const v = corner.v;
        const shift = inset[k] ? { x: inset[k].x - v.x, y: inset[k].y - v.y } : { x: 0, y: 0 };
        const move = (p: Pt): Pt => ({ x: p.x + shift.x, y: p.y + shift.y });
        // The realm's other outline edge at this corner (the border is a closed loop, so there is one).
        let other: EdgeId | null = null;
        for (const h of corner.hexes) {
          if (source.realmBorderOwnerAt(h.c.q, h.c.r) !== ownerId) continue;
          for (const oe of [(h.k + 5) % 6, h.k]) {
            const id = edgeId(h.c, oe);
            if (sameEdge(id, self)) continue;
            const n = neighbourAcrossEdge(h.c, oe);
            if (source.realmBorderOwnerAt(n.q, n.r) !== ownerId) other = id;
          }
        }
        if (!other) return { end: move(down(v, edgeDrop(c, e))), link: null, clip: undefined as Pt[] | undefined, linkClip: undefined as Pt[] | undefined };
        const j = junction(corner, self, other, 'clip');
        return {
          end: move(j.end1),
          link: j.link && k === e ? ([move(j.link[0]), move(j.link[1])] as [Pt, Pt]) : null,
          clip: j.clipEnd1 ? j.clip : undefined,
          linkClip: j.clip,
        };
      });
      const clips = ends.flatMap((en) => (en.clip ? [en.clip] : []));
      lines.push({ a: ends[0].end, b: ends[1].end, layer, ...(clips.length > 0 ? { clip: clips } : {}) });
      for (const en of ends) {
        if (en.link) lines.push({ a: en.link[0], b: en.link[1], layer, ...(en.linkClip ? { clip: [en.linkClip] } : {}) });
      }
    }
    return { wash, lines };
  };

  return { hexGeometry, seaDrop };
}

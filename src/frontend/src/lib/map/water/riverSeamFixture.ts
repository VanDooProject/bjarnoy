// Test helper: two neighbouring real river cells composited the way the render texture does (every rim first, then every
// face over them), for the seam tests. Pairs are taken from the demo world's settlement view (positions in world units, as
// `RiverFlowEntry` places them).
import { topFaceEdgeIndex } from '../riverPath';
import type { TileOrientation } from '../types';
import { riverFrameInput, type RiverFrame } from './riverArtFixture';
import { buildBankContext, computeRiverRipple, confluenceArmRanges, type PlacedMask } from './riverFlow';
import { splitFaceAndRim } from './riverFlowLayer';

/** Tile art drawn 168 wide for 200 source px. */
export const WORLD_PER_SOURCE_PX = 168 / 200;
export const TEXEL_WORLD = 2 * WORLD_PER_SOURCE_PX;

export interface SeamCell {
  name: string;
  /** World offset from the first cell of the pair. */
  dx: number;
  dy: number;
  out: TileOrientation;
  ins: TileOrientation[];
}

/** The direction from a hex to its neighbour at that world offset. */
export function directionOfOffset(dx: number, dy: number): TileOrientation {
  const table: [number, number, TileOrientation][] = [
    [126, 38.64, 'E'],
    [-126, -38.64, 'W'],
    [0, 77.28, 'SE'],
    [0, -77.28, 'NW'],
    [126, -38.64, 'NE'],
    [-126, 38.64, 'SW'],
  ];
  const hit = table.find(([x, y]) => Math.abs(x - dx) < 1 && Math.abs(y - dy) < 1);
  if (!hit) throw new Error(`not neighbours: ${dx},${dy}`);
  return hit[2];
}

const OPPOSITE: Record<TileOrientation, TileOrientation> = { E: 'W', W: 'E', SE: 'NW', NW: 'SE', NE: 'SW', SW: 'NE' };

/**
 * Pairs that really are connected: the first flows into the second or the other way round, along their shared edge.
 * Measured in the demo world's settlement view (the seams of `seam-shots`).
 */
export const SEAM_PAIRS: readonly [SeamCell, SeamCell][] = [
  [{ name: 'rivertile_bend120_meander_NW_base', dx: 0, dy: 0, out: 'NW', ins: ['E'] }, { name: 'rivertile_y_narrow_SE_base', dx: 126, dy: 38.64, out: 'W', ins: ['E', 'SE'] }],
  [{ name: 'rivertile_bend180_island_SW_base', dx: 0, dy: 0, out: 'NE', ins: ['SW'] }, { name: 'rivertile_bend120_island_E_base', dx: 126, dy: -38.64, out: 'NW', ins: ['SW'] }],
  [{ name: 'rivertile_y_narrow_SE_base', dx: 0, dy: 0, out: 'W', ins: ['E', 'SE'] }, { name: 'rivertile_bend120_island_E_base', dx: 0, dy: 77.28, out: 'NW', ins: ['SW'] }],
  [{ name: 'rivertile_y_narrow_SE_base', dx: 0, dy: 0, out: 'W', ins: ['E', 'SE'] }, { name: 'rivertile_bend120_meander_SE_base', dx: 126, dy: 38.64, out: 'W', ins: ['SE'] }],
  [{ name: 'rivertile_bend120_meander_SE_base', dx: 0, dy: 0, out: 'W', ins: ['SE'] }, { name: 'rivertile_bend180_island_W_base', dx: 0, dy: 77.28, out: 'NW', ins: ['SE'] }],
  [{ name: 'rivertile_bend180_island_W_base', dx: 0, dy: 0, out: 'NW', ins: ['SE'] }, { name: 'rivertile_bend_NW_base', dx: 0, dy: 77.28, out: 'NW', ins: ['E'] }],
  // Bog creeks (the bogcreek frames of the demo world): a river into a creek, and two creek hexes.
  [{ name: 'rivertile_bend180_island_NW_base', dx: 0, dy: 0, out: 'W', ins: ['E'] }, { name: 'bogcreek_NW_variant002_base', dx: 126, dy: 38.64, out: 'W', ins: ['E'] }],
  [{ name: 'bogcreek_NW_variant002_base', dx: 0, dy: 0, out: 'W', ins: ['E'] }, { name: 'bogcreek_bend_SE_variant002_base', dx: 126, dy: 38.64, out: 'W', ins: ['SE'] }],
];

export interface ComposedCell {
  cell: SeamCell;
  frame: RiverFrame;
  /** World position of texel (0, 0)'s corner. */
  x: number;
  y: number;
  /** The cell's edge facing its partner. */
  seamEdge: number;
  face: Uint8Array;
  rim: Uint8Array;
  /** The stream function's face and rim (`computeRiverRipple`'s `psi`). */
  psiFace: Uint8Array;
  psiRim: Uint8Array;
}

/** Computes both cells of a pair (with the neighbour's water as bank context unless `withContext` is false). */
export async function composePair(pair: readonly [SeamCell, SeamCell], withContext: boolean): Promise<ComposedCell[]> {
  const frames = await Promise.all(pair.map((c) => riverFrameInput(c.name)));
  const placed: PlacedMask[] = pair.map((c, i) => ({
    mask: frames[i]!.mask,
    cw: frames[i]!.cw,
    ch: frames[i]!.ch,
    x: c.dx + frames[i]!.sx * WORLD_PER_SOURCE_PX,
    y: c.dy + frames[i]!.sy * WORLD_PER_SOURCE_PX,
  }));
  const toB = directionOfOffset(pair[1].dx - pair[0].dx, pair[1].dy - pair[0].dy);
  const edges = [topFaceEdgeIndex(toB), topFaceEdgeIndex(OPPOSITE[toB])];
  const toPartner = (i: number): TileOrientation => (i === 0 ? toB : OPPOSITE[toB]);
  return pair.map((cell, i) => {
    const frame = frames[i]!;
    const context = withContext
      ? buildBankContext(placed[i]!, frame.polygon, [{ edge: edges[i]!, cell: placed[1 - i]! }], TEXEL_WORLD)
      : undefined;
    // A cell that feeds an arm of its partner takes that arm's share of the partner's stream function (as RiverFlowLayer does).
    const partner = pair[1 - i]!;
    let psiRange: [number, number] | undefined;
    if (toPartner(i) === cell.out) {
      const arm = confluenceArmRanges(frame.polygon, topFaceEdgeIndex(partner.out), partner.ins.map(topFaceEdgeIndex)).get((edges[i]! + 3) % 6);
      if (arm) psiRange = arm;
    }
    const flow = computeRiverRipple({ ...frame, inEdges: cell.ins.map(topFaceEdgeIndex), outEdge: topFaceEdgeIndex(cell.out), context, psiRange });
    const { face, rim } = splitFaceAndRim(flow.data, flow.inside);
    const psiParts = splitFaceAndRim(flow.psi, flow.inside);
    return { cell, frame, x: placed[i]!.x, y: placed[i]!.y, seamEdge: edges[i]!, face, rim, psiFace: psiParts.face, psiRim: psiParts.rim };
  });
}

/** What the composite shows at a world point: rims first, then faces over them (later cells over earlier ones). */
export function sampleComposite(cells: readonly ComposedCell[], wx: number, wy: number, psi = false): { b: number; theta: number; who: number; pass: 'face' | 'rim'; cos: number; sin: number } | null {
  let res: ReturnType<typeof sampleComposite> = null;
  for (const pass of ['rim', 'face'] as const) {
    cells.forEach((c, who) => {
      const tx = Math.floor((wx - c.x) / TEXEL_WORLD);
      const ty = Math.floor((wy - c.y) / TEXEL_WORLD);
      if (tx < 0 || ty < 0 || tx >= c.frame.cw || ty >= c.frame.ch) return;
      const d = psi ? (pass === 'face' ? c.psiFace : c.psiRim) : c[pass];
      const o = (ty * c.frame.cw + tx) * 4;
      if (d[o + 3] === 0) return;
      const rawCos = d[o]! / 127.5 - 1;
      const rawSin = d[o + 1]! / 127.5 - 1;
      const norm = Math.hypot(rawCos, rawSin) || 1;
      const cos = rawCos / norm;
      const sin = rawSin / norm;
      res = { b: d[o + 2]! / 255, theta: Math.atan2(sin, cos), who, pass, cos, sin };
    });
  }
  return res;
}

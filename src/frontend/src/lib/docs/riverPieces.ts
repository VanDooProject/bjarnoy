// The river pieces the Rivers docs page lists: each piece, per width, with its looks. The art is whatever the game's own river art
// table (`RIVER_FAMILY`, textures.ts: the one `riverArtFor` resolves through) names, and a look only shows when the showcase atlas
// has its frame, so a new look shows up with the next art drop and a missing one never leaves a hole.
import { findAtlasFrame, type AtlasFrameRect } from '../map/atlas';
import { RIVER_FAMILY } from '../map/textures';

type ArtShape = keyof typeof RIVER_FAMILY;

export type RiverPieceId = 'spring' | 'straight' | 'bend' | 'bend60' | 'widening' | 'streamsMeet' | 'confluence' | 'streamIntoRiver' | 'mouth';
export type RiverPieceWidth = 'stream' | 'river';

/** `id` is a `docs.rivers.pieces.looks.*` key. */
interface LookDef {
  id: string;
  shape: ArtShape;
}

const PIECES: { id: RiverPieceId; widths: Partial<Record<RiverPieceWidth, LookDef[]>> }[] = [
  { id: 'spring', widths: { stream: [{ id: 'corrie', shape: 'springcorrie' }, { id: 'saddleback', shape: 'springsaddleback' }] } },
  {
    id: 'straight',
    widths: {
      stream: [{ id: 'plain', shape: 'small_straight' }, { id: 'meander', shape: 'small_straight_meander' }],
      river: [{ id: 'plain', shape: 'straight' }, { id: 'island', shape: 'straight_island' }, { id: 'meander', shape: 'straight_meander' }],
    },
  },
  {
    id: 'bend',
    widths: {
      stream: [{ id: 'plain', shape: 'small_bend' }, { id: 'meander', shape: 'small_bend_meander' }],
      river: [{ id: 'plain', shape: 'bend' }, { id: 'island', shape: 'bend_island' }, { id: 'meander', shape: 'bend_meander' }],
    },
  },
  {
    id: 'bend60',
    widths: {
      stream: [{ id: 'plain', shape: 'small_bend60' }, { id: 'loop', shape: 'small_bend60_loop' }],
      river: [{ id: 'plain', shape: 'bend60' }, { id: 'loop', shape: 'bend60_loop' }],
    },
  },
  { id: 'widening', widths: { river: [{ id: 'plain', shape: 'widen_straight' }] } },
  { id: 'streamsMeet', widths: { river: [{ id: 'narrow', shape: 'widen_yn' }, { id: 'wide', shape: 'widen_yw' }] } },
  { id: 'confluence', widths: { river: [{ id: 'narrow', shape: 'confluencenarrow' }, { id: 'wide', shape: 'confluencewide' }] } },
  { id: 'streamIntoRiver', widths: { river: [{ id: 'plain', shape: 'riverstream' }] } },
  { id: 'mouth', widths: { river: [{ id: 'plain', shape: 'delta' }] } },
];

export interface RiverPieceLook {
  id: string;
  frame: AtlasFrameRect;
}
export interface RiverPiece {
  id: RiverPieceId;
  /** Widths the piece comes in, each with the looks the atlas has (never empty). */
  widths: Partial<Record<RiverPieceWidth, RiverPieceLook[]>>;
}

/** The pieces with every look the atlas actually has; a piece with none is left out. */
export function riverPieces(frameOf: (name: string) => AtlasFrameRect | undefined = (name) => findAtlasFrame('showcase', name)): RiverPiece[] {
  const result: RiverPiece[] = [];
  for (const piece of PIECES) {
    const widths: RiverPiece['widths'] = {};
    for (const [width, looks] of Object.entries(piece.widths) as [RiverPieceWidth, LookDef[]][]) {
      const found = looks.flatMap((look) => {
        const frame = frameOf(`${RIVER_FAMILY[look.shape]}_SE`);
        return frame ? [{ id: look.id, frame }] : [];
      });
      if (found.length > 0) widths[width] = found;
    }
    if (Object.keys(widths).length > 0) result.push({ id: piece.id, widths });
  }
  return result;
}

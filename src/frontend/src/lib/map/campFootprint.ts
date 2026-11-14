// Camps that fill a 7-hex footprint (anchor plus its six neighbours) instead of one hex: today only Naglfar
// (docs/design/endgame.md "Naglfar"). Such a camp is stored once, at its anchor, and drawn as a giant tile over
// `giantCoverage(anchor)` with the giant art family below, so it reuses the giant drawing path (`giantTiles.ts`).
import type { AxialCoord } from '../hex/coords';
import { giantCoverage, type GiantCoverage } from './giantTiles';
import type { GiantFamily } from './giantPlacement';

const CAMP_GIANT_FAMILY: Readonly<Record<string, GiantFamily>> = {
  naglfar: 'giantnaglfar',
};

/** The giant art family a camp family is drawn with, or `undefined` for a one-hex camp. */
export function campGiantFamily(campFamily: string): GiantFamily | undefined {
  return CAMP_GIANT_FAMILY[campFamily];
}

/** The 7 hexes a camp of `campFamily` at `anchor` covers, or just the anchor for a one-hex camp. */
export function campFootprint(campFamily: string, anchor: AxialCoord): GiantCoverage[] {
  return campGiantFamily(campFamily) ? giantCoverage(anchor) : [{ coord: anchor, part: 'C' }];
}

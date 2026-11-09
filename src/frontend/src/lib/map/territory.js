// The giants territory rule — a client-side mirror of the backend's
// `Bjarnoy.Domain.Buildings.Territory` (see that file's own doc comment for
// the rule statement). A settlement's claim discs cover a plain hex exactly
// as before, but a hex belonging to a giant's 7-hex footprint (see
// `giantTiles.ts`'s `giantCoverage`) is only claimed once EVERY one of that
// footprint's 7 hexes is covered by the disc union — a claim that merely
// touches or partially overlaps a giant claims none of it.
//
// Deliberately its own module (not folded into `WorldModel.ts` or
// `giantTiles.ts`): it is pure and unit-testable with plain data, no
// `WorldModel` dependency, so both `WorldModel.ts` (the real, tile-backed
// `giantAt` lookup) and `territory.golden.test.ts` (the shared
// `territory-giants-golden.json` fixture, computed with a plain in-memory
// `giantAt`) can drive it identically. See
// `Bjarnoy.Domain.Tests.TerritoryGoldenTests` for the backend half of the
// same parity guard.
import { hexDistance } from '../hex/coords';
import { giantCoverage } from './giantTiles';
/**
 * Whether `coord` is claimed by the union of `discs`, honouring the giants
 * rule above. `giantAt(coord)` returns the anchor of the giant `coord`
 * belongs to (any of its 7 footprint hexes), or `null` when `coord` isn't
 * part of any giant — mirrors `IGiantIndex.TryGetGiant` (backend) closely
 * enough that a caller's own giant index (a coord -> anchor map, e.g.
 * `WorldModel`'s) can answer it directly.
 */
export function claimsWithGiants(discs, coord, giantAt) {
    const anchor = giantAt(coord);
    if (anchor) {
        return isGiantFullyCovered(discs, anchor);
    }
    return coveredByAnyDisc(discs, coord);
}
/** Whether every one of the giant anchored at `anchor`'s 7 footprint hexes falls inside some disc of `discs` — mirrors `Territory.IsFullyCovered`. */
export function isGiantFullyCovered(discs, anchor) {
    return giantCoverage(anchor).every(({ coord }) => coveredByAnyDisc(discs, coord));
}
function coveredByAnyDisc(discs, coord) {
    for (const disc of discs) {
        if (hexDistance({ q: disc.q, r: disc.r }, coord) <= disc.radius)
            return true;
    }
    return false;
}

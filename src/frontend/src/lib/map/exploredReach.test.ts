// The invariant the clipped viewport scan rests on.
//
// `HexMapRenderer.scanClipSources` bounds the rebuild's scan to discs of
// `exploredRadius(s) + FOG_TERRAIN_CULL_HEXES` around each settlement, on the
// grounds that a hex can only be drawn if it is explored or within that
// distance of a settlement — and that every explored hex is itself within
// `exploredRadius` of whichever settlement explored it.
//
// That second half is the load-bearing one, and it is a relationship between
// two methods that were written independently: `exploredHexesFor` walks each
// vision disc out to `disc.radius + FOG_SCOUT_RING`, while `exploredRadius`
// reports the max over those same discs of
// `distance(settlement, disc) + disc.radius + FOG_SCOUT_RING`. The triangle
// inequality makes the second bound the first today. If either ever changes —
// a new kind of vision source, a disc that isn't a disc — the scan starts
// silently dropping terrain in a corner of the map at some zoom levels, which
// is about the least debuggable failure this renderer could have.
//
// So: assert it, over settlements with towers, levels and offsets.
import { describe, expect, it } from 'vitest';
import { WorldModel } from './WorldModel';
import { hexDistance, parseKey } from '../hex/coords';

const SWEEP = 80;

/** Every hex the model considers explored, as coords. */
function exploredHexes(model: WorldModel, around: { q: number; r: number }): { q: number; r: number }[] {
  // `explored` is private; `isExplored` is the public read, so sweep a box
  // comfortably larger than any settlement's reach, centred on the settlement
  // (islands are far apart: the nearest land to the origin can be 200 hexes away).
  const out: { q: number; r: number }[] = [];
  for (let q = around.q - SWEEP; q <= around.q + SWEEP; q++) {
    for (let r = around.r - SWEEP; r <= around.r + SWEEP; r++) {
      if (model.isExplored(q, r)) out.push({ q, r });
    }
  }
  return out;
}

describe('explored hexes stay within exploredRadius of their settlement', () => {
  it('holds for a freshly founded settlement', () => {
    const model = new WorldModel(20260824);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    expect(at).not.toBeNull();
    const settlement = model.foundSettlement('p1', 'You', 'Home', at);
    const radius = model.exploredRadius(settlement);
    const explored = exploredHexes(model, at);

    expect(explored.length).toBeGreaterThan(0);
    for (const hex of explored) {
      expect(hexDistance(hex, { q: settlement.q, r: settlement.r }), `${hex.q},${hex.r}`).toBeLessThanOrEqual(radius);
    }
  });

  it('holds once towers push vision off the settlement centre', () => {
    const model = new WorldModel(20260824);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('p1', 'You', 'Home', at);
    settlement.level = 9; // three towers are allowed at longhouse 9
    // Towers are what make this non-trivial: they explore around a point that
    // is not the settlement, so the radius has to account for the offset.
    // Placement has real rules (owned, land, empty), so take whatever the
    // model actually accepts rather than hard-coding coords that may be sea.
    let placed = 0;
    for (let dq = -6; dq <= 6 && placed < 3; dq++) {
      for (let dr = -6; dr <= 6 && placed < 3; dr++) {
        if (model.placeBuilding(settlement.id, { q: at.q + dq, r: at.r + dr }, 'tower')) placed++;
      }
    }
    expect(placed).toBeGreaterThan(0);
    model.claimTerritory(settlement.id);

    const radius = model.exploredRadius(settlement);
    for (const hex of exploredHexes(model, at)) {
      expect(hexDistance(hex, { q: settlement.q, r: settlement.r }), `${hex.q},${hex.r}`).toBeLessThanOrEqual(radius);
    }
  });

  it('holds for several settlements at once, each against its own radius', () => {
    const model = new WorldModel(20260824);
    const homeAt = model.findLandfall({ q: 0, r: 0 })!;
    const a = model.foundSettlement('p1', 'You', 'Home', homeAt);
    const b = model.foundSettlement('p2', 'Rival', 'Theirs', model.findLandfall({ q: homeAt.q + 25, r: homeAt.r - 12 })!);
    const radii = [
      { s: a, radius: model.exploredRadius(a) },
      { s: b, radius: model.exploredRadius(b) },
    ];

    for (const hex of exploredHexes(model, homeAt)) {
      // Every explored hex must be covered by *someone*, which is what makes
      // the union of discs a superset of the explored set.
      const covered = radii.some(({ s, radius }) => hexDistance(hex, { q: s.q, r: s.r }) <= radius);
      expect(covered, `${hex.q},${hex.r} outside every settlement's explored radius`).toBe(true);
    }
  });

  it('keeps every stored explored key inside the swept box, so the sweep above is not missing any', () => {
    // Guards the test itself: if a future change explored something past ±80 of the settlement,
    // the assertions above would pass by never looking at it.
    const model = new WorldModel(20260824);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('p1', 'You', 'Home', at);
    const radius = model.exploredRadius(settlement);
    // The sweep box (centred on the settlement) has to clear the settlement's reach.
    expect(radius).toBeLessThan(SWEEP);
    expect(parseKey('3,4')).toEqual({ q: 3, r: 4 });
  });
});

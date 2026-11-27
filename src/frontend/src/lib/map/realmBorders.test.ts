// Which hexes draw a realm border and which edges of them are stroked. A rival's border shows wherever the fog is not fully
// opaque (docs/design/map-fog-v2.md section 1h), not only on explored ground; the player's own stays on explored ground.
import { describe, expect, it } from 'vitest';
import { hexesInRadius, type AxialCoord } from '../hex/coords';
import { FogCoverage } from './fog/fogCoverage';
import { maskBounds, toTexel, type MaskBounds } from './fog/fogMaskLayout';
import { outerEdgesOf, ownedAcrossEdges, shownBorderOwner } from './realmBorders';
import { WorldModel } from './WorldModel';
import type { Settlement } from './types';

const RIVAL = '01900000-0000-7000-8000-000000000001';
const BOUNDS: MaskBounds = maskBounds(-30, -60, 31, 61);

/** A mask where every hex is fully unknown (R 255) except the given ones. */
function coverageWith(hexes: ReadonlyArray<{ q: number; r: number; R: number }>): FogCoverage {
  const pixels = new Uint8ClampedArray(BOUNDS.width * BOUNDS.height * 4).fill(255);
  for (const { q, r, R } of hexes) {
    const { u, v } = toTexel({ q, r });
    pixels[((v - BOUNDS.minV) * BOUNDS.width + (u - BOUNDS.minU)) * 4] = R;
  }
  return new FogCoverage(BOUNDS, pixels);
}

function settlement(id: string, ownerId: string, at: AxialCoord): Settlement {
  return {
    id, ownerId, ownerName: 'Owner', name: 'Realm', q: at.q, r: at.r, level: 1,
    resources: { wood: 0, stone: 0, food: 0, iron: 0 }, rates: { wood: 0, stone: 0, food: 0, iron: 0 }, foundedAt: 0,
  };
}

const wall = (q: number, r: number) => ({ q, r, type: 'palisade', level: 1, settlementId: RIVAL, ownerUserId: 'u' as string | null, outsideRealm: true });

function rivalModel(coverage: FogCoverage | null): WorldModel {
  const model = new WorldModel(20260825);
  model.registerSettlement(settlement(RIVAL, RIVAL, { q: 0, r: 0 }));
  model.applyRivalBuildings([{ q: 6, r: 0, type: 'tower', level: 2, settlementId: RIVAL, ownerUserId: 'u' }]);
  model.claimAllTerritory();
  if (coverage) model.setFogCoverage(coverage);
  return model;
}

describe('shownBorderOwner', () => {
  it('draws a rival\'s border on a hex whose mist is not fully opaque, even unexplored, and not on a fully opaque one', () => {
    // R 100 is on the ramp (below the opaque byte 204) but not explored (0).
    const model = rivalModel(coverageWith([{ q: 1, r: 0, R: 100 }]));
    expect(model.isExplored(1, 0)).toBe(false);

    expect(shownBorderOwner(model, 1, 0, true)).toBe(RIVAL);
    expect(shownBorderOwner(model, -2, 0, true)).toBeUndefined();
    // No fog, no gate.
    expect(shownBorderOwner(model, -2, 0, false)).toBe(RIVAL);
  });

  it('stays at the explored ground for the player\'s own realm', () => {
    const model = new WorldModel(20260825);
    model.registerSettlement(settlement('own-1', 'account-1', { q: 0, r: 0 }));
    model.claimAllTerritory();
    model.setFogCoverage(coverageWith([{ q: 1, r: 0, R: 100 }, { q: 0, r: 1, R: 0 }]));

    // The own Longhouse explored the ground itself; a hex only on the ramp is not explored, so it draws none.
    expect(model.isExplored(1, 0)).toBe(true);
    expect(shownBorderOwner(model, 1, 0, true)).toBe('own-1');
    const far = { q: 25, r: 0 };
    model.getTile(far.q, far.r).ownerId = 'own-1';
    expect(shownBorderOwner(model, far.q, far.r, true)).toBeUndefined();
  });
});

describe('a rival palisade with towers at the edge of sight', () => {
  // The Milfgard screenshot: Longhouse (radius 2) at the origin, a level 2 tower six hexes out, a wall line between them and
  // the fog clear over the whole stretch. Only claims draw a border: one outline around the discs, none around single wall hexes.
  const discHexes = [...hexesInRadius({ q: 0, r: 0 }, 2), ...hexesInRadius({ q: 6, r: 0 }, 2)];
  const clear = hexesInRadius({ q: 3, r: 0 }, 8).map((c) => ({ ...c, R: 0 }));
  const walls = [3, 9, 10].map((q) => wall(q, 0));

  it('draws no outline on a wall hex outside every claim disc, and no hex outlined on all six sides', () => {
    const model = rivalModel(coverageWith(clear));
    model.applyRivalBuildings([{ q: 6, r: 0, type: 'tower', level: 2, settlementId: RIVAL, ownerUserId: 'u' }, ...walls]);
    model.claimAllTerritory();

    for (const w of walls) expect(shownBorderOwner(model, w.q, w.r, true)).toBeUndefined();

    const shown = clear.filter((c) => shownBorderOwner(model, c.q, c.r, true) === RIVAL);
    expect(shown.length).toBe(new Set(discHexes.map((c) => `${c.q},${c.r}`)).size);
    for (const c of shown) {
      const outer = outerEdgesOf(ownedAcrossEdges(model, c, RIVAL));
      expect(outer.length).toBeLessThan(6);
    }
  });

  it('closes the outline around the discs: every outer edge faces a hex of no realm', () => {
    const model = rivalModel(coverageWith(clear));
    model.applyRivalBuildings([{ q: 6, r: 0, type: 'tower', level: 2, settlementId: RIVAL, ownerUserId: 'u' }, ...walls]);
    model.claimAllTerritory();

    // A radius 2 disc has 6 sides of 5 hex-edges, and the two discs do not touch.
    const perimeter = (centre: AxialCoord) =>
      hexesInRadius(centre, 2).reduce((n, c) => n + outerEdgesOf(ownedAcrossEdges(model, c, RIVAL)).length, 0);
    expect(perimeter({ q: 0, r: 0 })).toBe(30);
    expect(perimeter({ q: 6, r: 0 })).toBe(30);
  });
});

// The docs pages' variant pickers (see TechTreeView.vue's sawmill Inland/
// River/River bend selector) rely on buildingArtByFamily resolving each of
// a building's several art families directly, rather than only the single
// family buildingArt() maps a wire type to. This guards that path so a
// broken family name silently falls through to "no art" instead of failing
// loudly here.
import { describe, expect, it } from 'vitest';
import { buildingArt, buildingArtByFamily } from './buildingArt';

describe('buildingArtByFamily', () => {
  it('resolves art for each of the sawmill families', () => {
    for (const family of ['sawmill', 'sawmillriver', 'sawmillbend']) {
      expect(buildingArtByFamily(family, 1)).toBeDefined();
    }
  });

  it('matches buildingArt(type) for the family that type maps to', () => {
    expect(buildingArtByFamily('sawmill', 1)).toEqual(buildingArt('sawmill', 1));
  });

  it('returns undefined for a family with no art in the pack', () => {
    expect(buildingArtByFamily('not-a-real-family', 1)).toBeUndefined();
  });
});

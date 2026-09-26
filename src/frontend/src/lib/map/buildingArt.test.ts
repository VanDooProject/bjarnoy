// Two things this file guards:
// - buildingArtByFamily backs the docs pages' variant pickers (see
//   TechTreeView.vue's sawmill Inland/River/River bend selector), resolving
//   each of a building's several art families directly rather than only the
//   single family buildingArt() maps a wire type to. This guards that path
//   so a broken family name silently falls through to "no art" instead of
//   failing loudly here.
// - buildingLayers/buildingLayersForType back AnimatedBuildingSprite.vue's
//   docs-page animation (waterwheels, walk cycles) — this locks down that
//   the base/top/clip lookup actually finds real vendored art rather than
//   only working by accident against whatever was open in an editor at the
//   time.
import { describe, expect, it } from 'vitest';
import { buildingArt, buildingArtByFamily, buildingLayers, buildingLayersForType } from './buildingArt';

describe('buildingArtByFamily', () => {
  it('resolves art for each of the sawmill families', () => {
    for (const family of ['sawmill', 'sawmillriver', 'sawmillbend', 'sawmillbend60']) {
      expect(buildingArtByFamily(family, 1)).toBeDefined();
    }
  });

  // A Sawmill is never actually on plain ground (BuildingCatalogue.
  // SawmillRiverShapes requires a river) — BUILDING_ART_FAMILIES.sawmill
  // maps the wire type straight to the river family now, not the grass
  // 'sawmill' family buildingArtByFamily('sawmill', ...) still resolves for
  // the docs page's own variant picker (see ART_VARIANTS in
  // TechTreeView.vue, which no longer offers that inland variant either).
  it('matches buildingArt(type) for the family that type maps to', () => {
    expect(buildingArtByFamily('sawmillriver', 1)).toEqual(buildingArt('sawmill', 1));
  });

  // A Sawmill is never actually on plain ground — this asserts the wire
  // type's own lookup (buildingArt, used by BuildingModal/tech-tree preview
  // fallbacks) never resolves to the grass 'sawmill' family's art, even
  // though that family still exists in the pack (still directly reachable
  // via buildingArtByFamily('sawmill', ...) above, kept for now in case a
  // future docs page still wants to show it explicitly).
  it('never resolves the grass sawmill family through the wire type', () => {
    const grassArt = buildingArtByFamily('sawmill', 1);
    expect(buildingArt('sawmill', 1)).not.toEqual(grassArt);
  });

  it('returns undefined for a family with no art in the pack', () => {
    expect(buildingArtByFamily('not-a-real-family', 1)).toBeUndefined();
  });
});

describe('buildingLayers', () => {
  it('finds the base+top static pair for a plain family/level', () => {
    const layers = buildingLayers('sawmill', 1);
    expect(layers.base).toBeDefined();
    expect(layers.top).toBeDefined();
  });

  it('attaches a clip only when buildings-anim has one for that exact level', () => {
    // sawmillriver's waterwheel only spins from level 3 up (see textures.ts).
    expect(buildingLayers('sawmillriver', 3).clip).toBeDefined();
    expect(buildingLayers('sawmillriver', 1).clip).toBeUndefined();
  });

  it('a clip carries resolved frame rects, not just names', () => {
    const clip = buildingLayers('sawmillriver', 3).clip;
    expect(clip?.frameRects.length).toBeGreaterThan(1);
    expect(clip?.frameRects.length).toBe(clip?.frames.length);
  });

  it('returns nothing for a family with no buildings-static art', () => {
    expect(buildingLayers('not-a-real-family', 1)).toEqual({});
  });

  it('walks down to the highest authored level for a family with a shared base, rather than stopping at the requested level with no top and no clip', () => {
    // Regression coverage for a bug where a shared (`${family}_SE_base`)
    // base — truthy at every level — made the walk-down break immediately
    // at the requested level, even past the family's last authored `top`.
    // Meadery's art tops out at level 4 but the docs page's default preview
    // requests its catalogue max (10): before the fix this returned only
    // the shared base, with no top layer and no `buildings-anim` clip.
    const layers = buildingLayers('meadery', 10);
    expect(layers.top).toBeDefined();
    expect(layers.base).toBeDefined();
    expect(layers.clip).toBeDefined();
  });
});

describe('buildingLayersForType', () => {
  it('resolves through BUILDING_ART_FAMILIES like buildingArt does', () => {
    expect(buildingLayersForType('sawmill', 1)?.top).toBeDefined();
  });

  it('is undefined for a single-level-art type (no buildings-static split)', () => {
    expect(buildingLayersForType('magictower', 1)).toBeUndefined();
  });

  it('resolves FishingHut through the shared fisherhut family, not the old single-level art', () => {
    expect(buildingLayersForType('fishinghut', 1)?.top).toBeDefined();
  });

  it('is undefined for an unmapped type', () => {
    expect(buildingLayersForType('not-a-real-type', 1)).toBeUndefined();
  });
});

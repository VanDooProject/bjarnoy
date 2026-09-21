// buildingLayers/buildingLayersForType back AnimatedBuildingSprite.vue's
// docs-page animation (waterwheels, walk cycles) — this locks down that the
// base/top/clip lookup actually finds real vendored art rather than only
// working by accident against whatever was open in an editor at the time.
import { describe, expect, it } from 'vitest';
import { buildingLayers, buildingLayersForType } from './buildingArt';

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
});

describe('buildingLayersForType', () => {
  it('resolves through BUILDING_ART_FAMILIES like buildingArt does', () => {
    expect(buildingLayersForType('sawmill', 1)?.top).toBeDefined();
  });

  it('is undefined for a single-level-art type (no buildings-static split)', () => {
    expect(buildingLayersForType('fishinghut', 1)).toBeUndefined();
  });

  it('is undefined for an unmapped type', () => {
    expect(buildingLayersForType('not-a-real-type', 1)).toBeUndefined();
  });
});

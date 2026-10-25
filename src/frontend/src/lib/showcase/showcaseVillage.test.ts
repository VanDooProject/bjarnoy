import { describe, expect, it } from 'vitest';
import { hexesInRadius } from '../hex/coords';
import { WorldModel } from '../map/WorldModel';
import { DEFAULT_GENERATION, enumerateIslands } from '../map/worldGenerator';
import { buildShowcaseVillage, SHOWCASE_VILLAGE_OWNER } from './showcaseVillage';

const SEED = 20260824;

function build() {
  const model = new WorldModel(SEED);
  const islands = enumerateIslands({ seed: SEED, generation: DEFAULT_GENERATION }, 800);
  model.setIslands(islands);
  const nearest = islands.reduce((a, b) => (Math.hypot(a.q, a.r) <= Math.hypot(b.q, b.r) ? a : b));
  const result = buildShowcaseVillage(model, nearest, SEED);
  return { model, ...result };
}

function buildingsOf(model: WorldModel, settlementId: string, center: { q: number; r: number }) {
  return hexesInRadius(center, 20)
    .map((c) => model.getTile(c.q, c.r))
    .filter((t) => t.ownerId === settlementId && t.buildingType);
}

describe('buildShowcaseVillage', () => {
  const built = build();

  it('raises a village with a varied set of building types, owned by the dedicated owner', () => {
    expect(built.settlement.ownerId).toBe(SHOWCASE_VILLAGE_OWNER);
    const types = new Set(buildingsOf(built.model, built.settlement.id, built.center).map((t) => t.buildingType));
    expect(types.has('longhouse')).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  it('puts the preview crop on varied ground, not just grass and sand', () => {
    const terrains = new Set(built.model.previewCropTiles(built.center).map((c) => built.model.getTile(c.q, c.r).terrain));
    expect(terrains.size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for a seed', () => {
    const again = build();
    expect(again.center).toEqual(built.center);
    const summary = (b: typeof built) =>
      buildingsOf(b.model, b.settlement.id, b.center).map((t) => `${t.q},${t.r}:${t.buildingType}:${t.buildingLevel}`);
    expect(summary(again)).toEqual(summary(built));
  });
});

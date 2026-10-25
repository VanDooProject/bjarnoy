import { describe, expect, it } from 'vitest';
import { hexesInRadius, neighbors } from '../hex/coords';
import { WorldModel } from '../map/WorldModel';
import { DEFAULT_GENERATION, enumerateIslands } from '../map/worldGenerator';
import { buildShowcaseVillage, DECORATED_BOG_VARIANTS, diversifyLooks, SHOWCASE_VILLAGE_OWNER } from './showcaseVillage';

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

  const cropTiles = () => built.model.previewCropTiles(built.center).map((c) => built.model.getTile(c.q, c.r));

  it('frames the island\'s bog land, with open lake water and no plain look 0 on any bog hex', () => {
    const bog = cropTiles().filter((t) => t.bog);
    expect(bog.length).toBeGreaterThanOrEqual(20);
    expect(bog.filter((t) => t.bog?.kind === 'lake').length).toBeGreaterThanOrEqual(3);
    for (const tile of bog.filter((t) => !t.buildingType)) {
      expect((tile.variant ?? 0) % 9).not.toBe(0);
      if (tile.bog?.kind !== 'bog') expect(DECORATED_BOG_VARIANTS).toContain(tile.variant);
    }
  });

  it('shows a whole giant mountain, at least two camps and a wide spread of buildings in the crop', () => {
    const tiles = cropTiles();
    expect(tiles.filter((t) => t.giant?.family === 'giantmountain')).toHaveLength(7);
    expect(tiles.filter((t) => t.camp).length).toBeGreaterThanOrEqual(2);
    const types = new Set(tiles.filter((t) => t.buildingType).map((t) => t.buildingType));
    expect(types.has('longhouse')).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(10);
  });

  it('never puts two neighbouring undeveloped moss hexes in the same look', () => {
    const moss = (q: number, r: number) => {
      const t = built.model.getTile(q, r);
      return t.bog?.kind === 'bog' && !t.buildingType && !t.giant && !t.camp ? t : null;
    };
    const crop = built.model.previewCropTiles(built.center);
    const inCrop = new Set(crop.map((c) => `${c.q},${c.r}`));
    for (const c of crop) {
      const a = moss(c.q, c.r);
      if (!a) continue;
      for (const n of neighbors(c)) {
        const b = inCrop.has(`${n.q},${n.r}`) ? moss(n.q, n.r) : null;
        if (b) expect((a.variant ?? 0) % 9).not.toBe((b.variant ?? 0) % 9);
      }
    }
  });

  it('only re-rolls looks: terrain, bog kinds and buildings stay as generated', () => {
    const snapshot = () =>
      built.model.previewCropTiles(built.center).map((c) => {
        const t = built.model.getTile(c.q, c.r);
        return `${c.q},${c.r}:${t.terrain}:${t.bog?.kind ?? ''}:${t.buildingType ?? ''}:${t.giant ? 'g' : ''}${t.camp ? 'c' : ''}`;
      });
    const variants = () => cropTiles().map((t) => t.variant);
    const before = { shape: snapshot(), variants: variants() };
    diversifyLooks(built.model, built.center, SEED + 1);
    expect(snapshot()).toEqual(before.shape);
    expect(variants()).not.toEqual(before.variants);
  });

  it('never resolves a decorated variant to a bog family\'s plain look 0', () => {
    // The art pack's look counts per bog family: moss 9, lake 4, creeks/inlet/shore 3, spring/half shore/mouth 2.
    for (const count of [9, 4, 3, 2]) {
      for (const variant of DECORATED_BOG_VARIANTS) expect(variant % count).not.toBe(0);
    }
  });

  it('is deterministic for a seed', () => {
    const again = build();
    expect(again.center).toEqual(built.center);
    const summary = (b: typeof built) =>
      buildingsOf(b.model, b.settlement.id, b.center).map((t) => `${t.q},${t.r}:${t.buildingType}:${t.buildingLevel}`);
    expect(summary(again)).toEqual(summary(built));
  });
});

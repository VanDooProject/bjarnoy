import { describe, expect, it } from 'vitest';
import { hexDistance, hexesInRadius, neighbors } from '../hex/coords';
import { WorldModel } from '../map/WorldModel';
import { DEFAULT_GENERATION, enumerateIslands } from '../map/worldGenerator';
import { maxLevelFor } from '../map/buildingEconomy';
import { buildShowcaseVillage, DECORATED_BOG_VARIANTS, diversifyLooks, SHOWCASE_PREVIEW_RADIUS, SHOWCASE_RENDER_RADIUS, SHOWCASE_VILLAGE_OWNER } from './showcaseVillage';

const SEED = 20261823;

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
    expect(types.size).toBeGreaterThanOrEqual(20);
  });

  it('raises a bigger village: dozens of buildings, three towers, a dockyard and the coast', () => {
    const own = buildingsOf(built.model, built.settlement.id, built.center);
    expect(own.length).toBeGreaterThanOrEqual(30);
    expect(own.filter((t) => t.buildingType === 'tower')).toHaveLength(3);
    expect(own.filter((t) => t.buildingType === 'hut').length).toBeGreaterThanOrEqual(5);
    expect(own.some((t) => t.buildingType === 'dockyard')).toBe(true);
  });

  it('draws a wider island than the camera fits, so the crop edge lies outside the frame', () => {
    expect(SHOWCASE_RENDER_RADIUS).toBeGreaterThan(SHOWCASE_PREVIEW_RADIUS);
    const fit = built.model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS).length;
    expect(built.model.previewCropTiles(built.center, SHOWCASE_RENDER_RADIUS).length).toBeGreaterThan(fit * 3);
  });

  it('puts the preview crop on varied ground, not just grass and sand', () => {
    const terrains = new Set(built.model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS).map((c) => built.model.getTile(c.q, c.r).terrain));
    expect(terrains.size).toBeGreaterThanOrEqual(3);
  });

  const cropTiles = () => built.model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS).map((c) => built.model.getTile(c.q, c.r));

  it('frames the island\'s bog land, with open lake water and no plain look 0 on any bog hex', () => {
    const bog = cropTiles().filter((t) => t.bog);
    expect(bog.length).toBeGreaterThanOrEqual(20);
    expect(bog.filter((t) => t.bog?.kind === 'lake').length).toBeGreaterThanOrEqual(3);
    for (const tile of bog.filter((t) => !t.buildingType && !t.camp)) {
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
    expect(types.size).toBeGreaterThanOrEqual(15);
  });

  it('shows a camp of each wildlife family the wider crop has ground for, on its own ground', () => {
    const { model } = built;
    const crop = model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS);
    const camps = crop.filter((c) => model.getTile(c.q, c.r).camp).map((c) => ({ c, tile: model.getTile(c.q, c.r) }));
    const families = camps.map((x) => x.tile.camp!.family);
    const bog = camps.filter((x) => ['moosemire', 'beaverlodge', 'cranedance'].includes(x.tile.camp!.family));
    expect(bog.length).toBeGreaterThanOrEqual(2);
    for (const x of bog) expect(x.tile.bog?.kind).toBe('bog');
    for (const family of ['wolfden', 'harewarren', 'deerglade', 'bearrapids']) expect(families).toContain(family);
    // Seals only on shore sand, never on inland sand.
    for (const x of camps.filter((y) => y.tile.camp!.family === 'sealhaulout')) {
      expect(x.tile.terrain).toBe('sand');
      expect(neighbors(x.c).some((n) => model.getTile(n.q, n.r).terrain === 'sea')).toBe(true);
    }
    // Each ground-bound family stands on a straight river tile (bearrapids) / off rivers (the rest).
    for (const x of camps) {
      const onRiver = model.getRiverTile(x.c.q, x.c.r) !== undefined;
      if (x.tile.camp!.family === 'bearrapids') expect(onRiver).toBe(true);
      if (['moosemire', 'beaverlodge', 'cranedance', 'wolfden', 'harewarren', 'deerglade'].includes(x.tile.camp!.family)) expect(onRiver).toBe(false);
    }
    expect(new Set(families).size).toBe(families.length);
  });

  it('stands the village by the river: a Sawmill or Crop Mill on a river tile, a tower and the bog\'s own buildings', () => {
    const own = buildingsOf(built.model, built.settlement.id, built.center);
    const mills = own.filter((t) => (t.buildingType === 'sawmill' || t.buildingType === 'cropmill') && built.model.getRiverTile(t.q, t.r));
    expect(mills.length).toBeGreaterThanOrEqual(1);
    expect(own.some((t) => t.buildingType === 'tower')).toBe(true);
    const bogTypes = new Set(own.map((t) => t.buildingType).filter((b) => b === 'bogoreworks' || b === 'claybrickworks' || b === 'hammerschmiede'));
    expect(bogTypes.size).toBeGreaterThanOrEqual(2);
  });

  it('raises every building to a high level (7, or its own ceiling) so the richest art shows', () => {
    for (const tile of buildingsOf(built.model, built.settlement.id, built.center)) {
      // The longhouse is raised past 7 (to its planning level) for the tower limit, and towers stay at 3 (their claim disc would shade the sea); the level pass never lowers either.
      if (tile.buildingType === 'longhouse') expect(tile.buildingLevel).toBeGreaterThanOrEqual(7);
      else if (tile.buildingType === 'tower') expect(tile.buildingLevel).toBe(3);
      else expect(tile.buildingLevel).toBe(Math.min(7, maxLevelFor(tile.buildingType!)));
    }
  });

  it('keeps the giant mountain off the river and the bog', () => {
    const giants = cropTiles().filter((t) => t.giant?.family === 'giantmountain');
    expect(giants).toHaveLength(7);
    for (const t of giants) {
      expect(built.model.getRiverTile(t.q, t.r)).toBeUndefined();
      expect(t.bog).toBeUndefined();
    }
  });

  it('never puts two neighbouring undeveloped moss hexes in the same look', () => {
    const moss = (q: number, r: number) => {
      const t = built.model.getTile(q, r);
      return t.bog?.kind === 'bog' && !t.buildingType && !t.giant && !t.camp ? t : null;
    };
    const crop = built.model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS);
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
      built.model.previewCropTiles(built.center, SHOWCASE_PREVIEW_RADIUS).map((c) => {
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

  it('centres the frame between the bog site and the longhouse, on land', () => {
    const home = { q: built.settlement.q, r: built.settlement.r };
    expect(built.model.isLand(built.frameCenter.q, built.frameCenter.r)).toBe(true);
    expect(hexDistance(built.frameCenter, home)).toBeLessThan(hexDistance(built.center, home));
  });

  it('is deterministic for a seed', () => {
    const again = build();
    expect(again.center).toEqual(built.center);
    const summary = (b: typeof built) =>
      buildingsOf(b.model, b.settlement.id, b.center).map((t) => `${t.q},${t.r}:${t.buildingType}:${t.buildingLevel}`);
    expect(summary(again)).toEqual(summary(built));
  });
});

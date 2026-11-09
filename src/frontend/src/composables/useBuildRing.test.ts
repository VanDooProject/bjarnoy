// @vitest-environment jsdom
//
// The build ring's model, which the settlement map (MapView) and the onboarding (LandingView) share: what a hex
// offers is decided here, once. The expectations are the ones MapView's own ring had before it moved out.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { categoriesFor, useBuildRing } from './useBuildRing';
import { useWorldStore } from '../stores/world';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { formatBuildTime } from '../lib/map/ringCatalogue';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';

function mountRing() {
  const tile = ref<Tile | null>(null);
  const coord = ref<AxialCoord | null>(null);
  let ring!: ReturnType<typeof useBuildRing>;
  mount(
    defineComponent({
      setup() {
        ring = useBuildRing(tile, coord);
        return () => h('div');
      },
    }),
    { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } },
  );
  const select = (at: AxialCoord) => {
    coord.value = at;
    tile.value = useWorldStore().model.getTile(at.q, at.r);
  };
  return { ring, select, tile };
}

/** The first hex of `terrain` inside the founded settlement's claim that holds no building. */
function emptyHex(world: ReturnType<typeof useWorldStore>, terrain: Tile['terrain']): AxialCoord {
  const home = world.model.getSettlement(world.selectedSettlementId!)!;
  for (let q = home.q - 12; q <= home.q + 12; q++) {
    for (let r = home.r - 12; r <= home.r + 12; r++) {
      const tile = world.model.getTile(q, r);
      if (tile.terrain === terrain && tile.ownerId === world.selectedSettlementId && !tile.buildingType) return { q, r };
    }
  }
  throw new Error(`no empty ${terrain} hex in the claim`);
}

describe('useBuildRing', () => {
  let world: ReturnType<typeof useWorldStore>;
  beforeEach(async () => {
    setActivePinia(createPinia());
    world = useWorldStore();
    world.foundStartingSettlement('p1', 'Astrid', 'Realm', { q: 0, r: 0 });
    await useBuildingCatalogueStore().load();
    await flushPromises();
  });

  it('offers the map categories on a grass hex, each building with a cost and an availability', () => {
    const { ring, select } = mountRing();
    select(emptyHex(world, 'grass'));
    expect(ring.canBuildHere.value).toBe(true);
    const ids = ring.categories.value.map((c) => c.id);
    expect(ids).toEqual(['resource', 'military', 'logistics', 'defense', 'religion']);
    const resource = ring.categories.value.find((c) => c.id === 'resource')!;
    expect(resource.buildings.map((b) => b.id)).toContain('reindeerherder');
    // The tower is a defence building, not a military one.
    const military = ring.categories.value.find((c) => c.id === 'military')!;
    const defense = ring.categories.value.find((c) => c.id === 'defense')!;
    expect(military.buildings.map((b) => b.id)).not.toContain('tower');
    expect(defense.buildings.map((b) => b.id)).toContain('tower');
    for (const building of ring.categories.value.flatMap((c) => c.buildings)) {
      expect(building.cost).toBeDefined();
      expect(building.availability).toBeDefined();
    }
  });

  it('shows the build time at the world\'s speed', () => {
    const { ring, select } = mountRing();
    select(emptyHex(world, 'forest'));
    const lumberjack = () => ring.categories.value.flatMap((c) => c.buildings).find((b) => b.id === 'lumberjack')!;
    const base = useBuildingCatalogueStore().byType.lumberjack![0]!.buildSeconds;
    expect(lumberjack().time).toBe(formatBuildTime(base));
    world.worldSpeedFactor = 4;
    expect(lumberjack().time).toBe(formatBuildTime(base / 4));
  });

  it('offers a forest hex the lumberjack and nothing that only fits grass', () => {
    const { ring, select } = mountRing();
    select(emptyHex(world, 'forest'));
    const types = ring.categories.value.flatMap((c) => c.buildings.map((b) => b.id));
    expect(types).toContain('lumberjack');
    expect(types).not.toContain('reindeerherder');
    expect(ring.offersBuilding('lumberjack')).toBe(true);
    expect(ring.offersBuilding('reindeerherder')).toBe(false);
  });

  it('is empty until a hex is selected', () => {
    const { ring } = mountRing();
    expect(ring.categories.value).toEqual([]);
    expect(ring.canBuildHere.value).toBe(false);
  });

  it('keeps the river-only buildings off a hex that is no river', () => {
    const { ring, select } = mountRing();
    const hex = emptyHex(world, 'grass');
    expect(world.model.getRiverTile(hex.q, hex.r)).toBeFalsy();
    select(hex);
    const types = ring.categories.value.flatMap((c) => c.buildings.map((b) => b.id));
    expect(types).not.toContain('sawmill');
    expect(types).not.toContain('cropmill');
    expect(types).not.toContain('bridge');
  });

  it('places in demo mode through the shared path and refuses an occupied hex', () => {
    const { ring, select } = mountRing();
    const hex = emptyHex(world, 'grass');
    select(hex);
    expect(ring.placeBuildingDemo('reindeerherder', hex)).toBe(true);
    expect(world.model.getTile(hex.q, hex.r).buildingType).toBe('reindeerherder');
    // The hex is taken now: a second placement is refused.
    expect(ring.placeBuildingDemo('reindeerherder', hex)).toBe(false);
  });

  it('keys the placement filter by terrain', () => {
    // Mountains offer nothing while quarries are off: no Build action at all.
    expect(categoriesFor({ terrain: 'mountain' } as Tile)).toEqual([]);
    expect(categoriesFor({ terrain: 'lake' } as Tile)).toEqual([]);
    expect(categoriesFor({ terrain: 'sea', isCoastalWater: false } as Tile)).toEqual([]);
    expect(categoriesFor({ terrain: 'sea', isCoastalWater: true } as Tile).map((c) => c.id)).toEqual(['water', 'defense']);
  });

  it('offers sand only the tower and the walls, and a lake\'s half shore only the Fishing Hut', () => {
    const sand = categoriesFor({ terrain: 'sand' } as Tile);
    expect(sand.map((c) => c.id)).toEqual(['defense']);
    expect(sand[0].buildings.map((b) => b.type)).toEqual(['tower', 'palisade', 'palisadegate', 'bridge']);
    const half = categoriesFor({ terrain: 'bog', bog: { kind: 'half' } } as Tile);
    expect(half.map((c) => c.id)).toEqual(['water']);
    expect(half[0].buildings.map((b) => b.type)).toEqual(['fishinghut']);
  });

  it('offers nothing to build on a stream, a widening or a spring hex, and only the river buildings on a river-width straight', () => {
    const hex = emptyHex(world, 'grass');
    // The model's river map is not reactive: each case gets its own ring, as a fresh selection does.
    const ringOn = (shape: 'straight' | 'spring' | 'bend', width?: 'stream' | 'widen' | 'river') => {
      if (width) world.model.setRiverTiles([{ q: hex.q, r: hex.r, shape, inDirections: [], outDirection: null, width }]);
      else world.model.setRiverTiles([]);
      const { ring, select } = mountRing();
      select(hex);
      return ring;
    };
    expect(ringOn('straight').canBuildHere.value).toBe(true);

    for (const [shape, width] of [['straight', 'stream'], ['straight', 'widen'], ['spring', 'stream'], ['bend', 'stream'], ['spring', 'river']] as const) {
      const ring = ringOn(shape, width);
      expect(ring.categories.value, `${shape}/${width}`).toEqual([]);
      expect(ring.canBuildHere.value, `${shape}/${width}`).toBe(false);
    }

    // A river-width straight takes the river buildings and the bridge, no ordinary building (not a farm, a tower, a wall piece).
    const types = ringOn('straight', 'river').categories.value.flatMap((c) => c.buildings.map((b) => b.id));
    expect(types.every((id) => ['sawmill', 'cropmill', 'bridge'].includes(id))).toBe(true);
    expect(types).toContain('sawmill');

    // On a bend the Crop Mill stays as a disabled bubble that says (without degrees) it needs a straighter piece; the Sawmill is free.
    const bend = ringOn('bend', 'river').categories.value.flatMap((c) => c.buildings);
    const cropmill = bend.find((b) => b.id === 'cropmill')!;
    const tooCurved = (enHud as unknown as { ringMenu: { riverLock: { tooCurved: string } } }).ringMenu.riverLock.tooCurved;
    expect(cropmill.locks).toContain(tooCurved);
    expect(tooCurved).not.toMatch(/\d|°|degree/i);
    expect(bend.find((b) => b.id === 'sawmill')!.locks).not.toContain(tooCurved);
  });

  it('lists the tower under defense, and only, on every ground it may stand on (plain bog moss included)', () => {
    const tiles: Tile[] = [
      { terrain: 'grass' },
      { terrain: 'sand' },
      { terrain: 'forest' },
      { terrain: 'bog', bog: { kind: 'bog' } },
    ] as Tile[];
    for (const tile of tiles) {
      const where = categoriesFor(tile).filter((c) => c.buildings.some((b) => b.type === 'tower'));
      expect(where.map((c) => c.id), JSON.stringify(tile)).toEqual(['defense']);
    }
    // The bog's wall hexes stay next to it.
    const bogDefense = categoriesFor(tiles[3]).find((c) => c.id === 'defense')!;
    expect(bogDefense.buildings.map((b) => b.type)).toEqual(['tower', 'palisade', 'palisadegate']);
    // Bog ground that is not plain moss, and sea, never offer one.
    for (const kind of ['creek', 'half', 'shore', 'mouth', 'spring']) {
      const ids = categoriesFor({ terrain: 'bog', bog: { kind } } as Tile).flatMap((c) => c.buildings.map((b) => b.type));
      expect(ids, kind).not.toContain('tower');
    }
  });
});

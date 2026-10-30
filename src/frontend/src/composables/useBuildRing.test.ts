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
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
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
    { global: { plugins: [createTestI18n({ hud: enHud })] } },
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
    for (const building of ring.categories.value.flatMap((c) => c.buildings)) {
      expect(building.cost).toBeDefined();
      expect(building.availability).toBeDefined();
    }
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
});

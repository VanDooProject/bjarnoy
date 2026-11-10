// @vitest-environment jsdom
//
// The build ring's limit hints in live mode: a linked realm is one realm, so the tower, shrine and storage-house locks read the
// server's realm numbers (`construction.towerLimit` / `towersHeld`) and the realm's polled buildings and queue (the oldest
// member's read is the union of the members'), not the selected settlement's own model.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useBuildRing } from './useBuildRing';
import { useWorldStore } from '../stores/world';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';
import type { BuildOrderResponse, PlacedBuildingResponse } from '../api/types';

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { ...actual, DEMO_MODE: false };
});

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
  return {
    ring,
    select(at: AxialCoord) {
      coord.value = at;
      tile.value = useWorldStore().model.getTile(at.q, at.r);
    },
  };
}

function emptyGrassHex(world: ReturnType<typeof useWorldStore>): AxialCoord {
  const home = world.model.getSettlement(world.selectedSettlementId!)!;
  for (let q = home.q - 12; q <= home.q + 12; q++) {
    for (let r = home.r - 12; r <= home.r + 12; r++) {
      const tile = world.model.getTile(q, r);
      if (tile.terrain === 'grass' && tile.ownerId === world.selectedSettlementId && !tile.buildingType) return { q, r };
    }
  }
  throw new Error('no empty grass hex in the claim');
}

const placed = (type: string, level: number, q: number, r: number): PlacedBuildingResponse => ({ q, r, type, level }) as PlacedBuildingResponse;
const queued = (building: string, q: number, r: number): BuildOrderResponse => ({ building, q, r }) as unknown as BuildOrderResponse;

describe('useBuildRing limit hints in live mode', () => {
  let world: ReturnType<typeof useWorldStore>;
  beforeEach(async () => {
    setActivePinia(createPinia());
    world = useWorldStore();
    world.foundStartingSettlement('p1', 'Astrid', 'Realm', { q: 0, r: 0 });
    await useBuildingCatalogueStore().load();
    await flushPromises();
    world.hud.level = 30;
  });

  function lockOf(type: string): string[] {
    const { ring, select } = mountRing();
    select(emptyGrassHex(world));
    const card = ring.categories.value.flatMap((c) => c.buildings).find((b) => b.id === type);
    expect(card, `${type} is offered on grass`).toBeDefined();
    return card!.locks ?? [];
  }

  it('locks a new tower from the realm numbers the server sends, not the selected settlement own limit', () => {
    world.hud.construction = { ...world.hud.construction, towerLimit: 3, towersHeld: 3 };
    expect(lockOf('tower').join(' ')).toContain('Tower limit reached (3/3)');
  });

  it('keeps the tower open while the realm still has room', () => {
    world.hud.construction = { ...world.hud.construction, towerLimit: 3, towersHeld: 2 };
    expect(lockOf('tower').join(' ')).not.toContain('Tower limit');
  });

  it('locks every shrine when a shrine stands anywhere in the realm', () => {
    world.hud.buildings = [placed('shrineofthor', 3, 9, 9)];
    expect(lockOf('shrineoffreyja')).toContain(enHud.ringMenu.shrineLimitLock);
  });

  it('locks every shrine when one is queued anywhere in the realm', () => {
    world.hud.queue = [queued('odinstatue', 9, 9)];
    expect(lockOf('shrineofthor')).toContain(enHud.ringMenu.shrineLimitLock);
  });

  it('leaves the shrines open when the realm holds none', () => {
    world.hud.buildings = [placed('farm', 1, 9, 9)];
    expect(lockOf('shrineoffreyja')).not.toContain(enHud.ringMenu.shrineLimitLock);
  });

  it('counts the storage houses of the whole realm for an extra one', () => {
    world.hud.buildings = [placed('storagehouse', 25, 3, 0), placed('storagehouse', 1, 9, 9)];
    expect(lockOf('storagehouse')).toContain('Needs 2 Storehouses at level 15');

    world.hud.buildings = [placed('storagehouse', 25, 3, 0), placed('storagehouse', 25, 9, 9)];
    expect(lockOf('storagehouse')).not.toContain('Needs 2 Storehouses at level 15');
  });

  it('counts a queued storage house in the realm as held', () => {
    world.hud.buildings = [placed('storagehouse', 25, 3, 0)];
    world.hud.queue = [queued('storagehouse', 9, 9)];
    expect(lockOf('storagehouse')).toContain('Needs 2 Storehouses at level 15');
  });
});

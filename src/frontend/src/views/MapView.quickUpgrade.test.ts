// @vitest-environment jsdom
//
// The quick upgrade as MapView wires it: with the mode on (or Shift held) a click on an own building orders its next level and
// opens no ring; a blocked one sends nothing and shows the refusal chip with the reason the ring's Upgrade bubble gives; a click
// on anything else opens the ring; a free account never gets it. The map, the HUD and the ring are stand-ins that only hand the
// view its events: what is under test is the view's decision, over the real stores.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import MapView from './MapView.vue';
import RingMenu from '../components/hud/RingMenu.vue';
import BuildRefusalChip from '../components/hud/BuildRefusalChip.vue';
import { useWorldStore } from '../stores/world';
import { useAuthStore } from '../stores/auth';
import { useQuickUpgradeStore } from '../stores/quickUpgrade';
import { usePlayerStore } from '../stores/player';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import enCommon from '../i18n/locales/en/common.json';
import type { Tile } from '../lib/map/types';

vi.mock('../config', async (importOriginal) => ({ ...(await importOriginal<object>()), DEMO_MODE: false }));
const queueBuild = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/client')>();
  return { ...real, api: new Proxy(real.api, { get: (target, key) => (key === 'queueBuild' ? queueBuild : Reflect.get(target, key)) }) };
});

/** Stands in for the canvas: hands the view a hex click on demand, and has no renderer (the view reads it with `?.`). */
const CanvasStub = defineComponent({
  name: 'SettlementCanvas',
  emits: ['hex-click'],
  setup: () => () => h('div', { class: 'canvas-stub' }),
});

const LONGHOUSE = { q: 1, r: 0 };
const BARRACKS = { q: 3, r: 0 };
const EMPTY = { q: 5, r: 5 };

function tileAt(q: number, r: number): Tile {
  const base = { q, r, terrain: 'grass', ownerId: 's1' } as unknown as Tile;
  if (q === LONGHOUSE.q) return { ...base, buildingType: 'longhouse', buildingLevel: 1 } as Tile;
  if (q === BARRACKS.q) return { ...base, buildingType: 'barracks', buildingLevel: 2 } as Tile;
  return base;
}

describe('MapView quick upgrade', () => {
  let wrapper: VueWrapper;

  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/settlement', component: MapView }],
    });
    await router.push('/settlement');
    const Host = defineComponent({ render: () => h(RouterView) });
    wrapper = mount(Host, {
      attachTo: document.body,
      global: {
        plugins: [router, createTestI18n({ hud: enHud, catalogue: enCatalogue, common: enCommon })],
        stubs: {
          SettlementCanvas: CanvasStub,
          TopBar: true,
          HudNav: true,
          ResourceBar: true,
          MobileHudDrawer: true,
          HudPanelColumn: true,
          HudPanelDock: true,
          QuestTray: true,
          QueueDrawer: true,
          ArmyPanel: true,
          HexTooltip: true,
          BuildingModal: true,
          TrainingModal: true,
          BuildingHudLayer: true,
          MapStatusOverlay: true,
          MobileDispatchSheet: true,
          // The ring is the real one: whether it opens is what these tests read.
          RingMenu: false,
        },
      },
    });
    await flushPromises();
    return wrapper.getComponent(CanvasStub);
  }

  function seedWorld({ premium }: { premium: boolean }) {
    useAuthStore().user = { id: 'u1', userName: 'p', role: 'player', preferredLocale: null, isPremium: premium } as never;
    const world = useWorldStore();
    world.selectedSettlementId = 's1';
    world.hud.buildings = [
      { q: LONGHOUSE.q, r: LONGHOUSE.r, type: 'longhouse', level: 1 },
      { q: BARRACKS.q, r: BARRACKS.r, type: 'barracks', level: 2 },
    ];
    world.hud.queue = [];
    world.hud.construction = { slots: 4, slotsUsed: 0, maxWaitingOrders: 2, waitingOrders: 0, maxOrdersPerHex: 3, towerLimit: 0, towersHeld: 0 };
    world.hud.available = { wood: 1e6, stone: 1e6, food: 1e6, iron: 1e6 };
    world.hud.storageCap = { wood: 1e6, stone: 1e6, food: 1e6, iron: 1e6 };
    // Only the settings of the world these tests act through: the polling and the fetches are not under test.
    vi.spyOn(world, 'startHudSync').mockImplementation(() => {});
    vi.spyOn(world, 'refreshWorldSettlements').mockResolvedValue(undefined as never);
    vi.spyOn(world, 'fetchFogMask').mockResolvedValue(undefined as never);
    // No catalogue: the upgrade verdict falls back to the built-in costs, with no longhouse or prerequisite locks to race against.
    vi.spyOn(useBuildingCatalogueStore(), 'load').mockResolvedValue(undefined as never);
    vi.spyOn(useUnitCatalogueStore(), 'load').mockResolvedValue(undefined as never);
    vi.spyOn(world.model, 'getTile').mockImplementation(((q: number, r: number) => tileAt(q, r)) as never);
    usePlayerStore().id = 'p1';
    return world;
  }

  const click = (canvas: { vm: { $emit: (event: 'hex-click', ...args: unknown[]) => void } }, at: { q: number; r: number }) =>
    canvas.vm.$emit('hex-click', at, tileAt(at.q, at.r), { x: 200, y: 200 });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    queueBuild.mockReset();
    queueBuild.mockReturnValue(new Promise<void>(() => {}));
  });
  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('with the mode on, a click on an own building orders its next level and opens no ring', async () => {
    const world = seedWorld({ premium: true });
    useQuickUpgradeStore().start();
    const canvas = await mountView();

    click(canvas, BARRACKS);
    await flushPromises();

    expect(queueBuild).toHaveBeenCalledTimes(1);
    expect(queueBuild).toHaveBeenCalledWith('s1', { building: 'barracks', q: BARRACKS.q, r: BARRACKS.r }, undefined);
    expect(world.hud.queue.map((o) => o.targetLevel)).toEqual([3]);
    expect(wrapper.findComponent(RingMenu).exists()).toBe(false);
  });

  it('two taps in a row on the same building order level n+1 and then n+2', async () => {
    const world = seedWorld({ premium: true });
    useQuickUpgradeStore().start();
    const canvas = await mountView();

    click(canvas, BARRACKS);
    click(canvas, BARRACKS);
    await flushPromises();

    expect(queueBuild).toHaveBeenCalledTimes(2);
    expect(world.hud.queue.map((o) => o.targetLevel)).toEqual([3, 4]);
  });

  it('Shift held does the same without the mode', async () => {
    seedWorld({ premium: true });
    useQuickUpgradeStore().setShift(true);
    const canvas = await mountView();

    click(canvas, BARRACKS);
    await flushPromises();

    expect(queueBuild).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(RingMenu).exists()).toBe(false);
  });

  it('a blocked upgrade sends nothing and shows the reason the ring would give', async () => {
    const world = seedWorld({ premium: true });
    world.hud.available = { wood: 0, stone: 0, food: 0, iron: 0 };
    const canvas = await mountView();

    // What the ring's Upgrade bubble says for this building.
    click(canvas, BARRACKS);
    await flushPromises();
    const ring = wrapper.getComponent(RingMenu);
    const ringHint = ring.props('actions').find((a: { id: string }) => a.id === 'upgrade')?.hint;
    expect(ringHint).toMatch(/^Needs /);
    ring.vm.$emit('close');
    await flushPromises();

    useQuickUpgradeStore().start();
    click(canvas, BARRACKS);
    await flushPromises();

    expect(queueBuild).not.toHaveBeenCalled();
    const chip = wrapper.getComponent(BuildRefusalChip);
    expect(chip.props('message')).toBe(ringHint);
    expect(chip.props('coord')).toEqual(BARRACKS);
    expect(wrapper.findComponent(RingMenu).exists()).toBe(false);
    // The mode stays on after a refusal.
    expect(useQuickUpgradeStore().on).toBe(true);
  });

  it('a click on an empty hex still opens the ring, with the mode on', async () => {
    seedWorld({ premium: true });
    useQuickUpgradeStore().start();
    const canvas = await mountView();

    click(canvas, EMPTY);
    await flushPromises();

    expect(queueBuild).not.toHaveBeenCalled();
    expect(wrapper.findComponent(RingMenu).exists()).toBe(true);
  });

  it('a free account clicking with Shift held gets the ring, not an order', async () => {
    seedWorld({ premium: false });
    useQuickUpgradeStore().setShift(true);
    const canvas = await mountView();

    click(canvas, BARRACKS);
    await flushPromises();

    expect(queueBuild).not.toHaveBeenCalled();
    expect(wrapper.findComponent(RingMenu).exists()).toBe(true);
  });

  it('holding the ring\'s Upgrade bubble turns the mode on, closes the ring and orders that building', async () => {
    seedWorld({ premium: true });
    const canvas = await mountView();

    click(canvas, BARRACKS);
    await flushPromises();
    const ring = wrapper.getComponent(RingMenu);
    expect(ring.props('actions').find((a: { id: string }) => a.id === 'upgrade')).toMatchObject({ holdable: true });
    ring.vm.$emit('hold', 'upgrade');
    await flushPromises();

    expect(useQuickUpgradeStore().on).toBe(true);
    expect(queueBuild).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(RingMenu).exists()).toBe(false);
  });

  it('a free account\'s Upgrade bubble is not holdable and its card says quick upgrade is premium', async () => {
    seedWorld({ premium: false });
    const canvas = await mountView();

    click(canvas, BARRACKS);
    await flushPromises();
    const upgrade = wrapper.getComponent(RingMenu).props('actions').find((a: { id: string }) => a.id === 'upgrade');
    expect(upgrade?.holdable).toBe(false);
    expect(upgrade?.card?.holdHint).toEqual({ text: enHud.quickUpgrade.premiumHold, locked: true });
  });
});

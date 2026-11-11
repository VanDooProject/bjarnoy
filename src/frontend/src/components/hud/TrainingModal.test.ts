// @vitest-environment jsdom
//
// A building's training window: only the units this building type trains, the
// "Train in" / "Distribute" selectors (hidden with a single building), the
// premium-only "Fastest" split, and the {q, r, split} an order is sent with.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TrainingModal from './TrainingModal.vue';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import enApiErrors from '../../i18n/locales/en/apiErrors.json';
import unitCatalogue from '../../data/unit-catalogue.json';
import type { PlacedBuildingResponse, TrainingOrderResponse, UnitDefinitionResponse } from '../../api/types';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});

const trainUnits = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, trainUnits } };
});

const definitions = unitCatalogue.data as UnitDefinitionResponse[];
const barracks = { type: 'barracks', q: 3, r: -2, level: 7 };

function placed(type: string, q: number, r: number, level: number, extra: Partial<PlacedBuildingResponse> = {}): PlacedBuildingResponse {
  return { type, q, r, level, ...extra };
}

function order(q: number, r: number, id: string): TrainingOrderResponse {
  return {
    id,
    unit: 'thrall',
    q,
    r,
    count: 1,
    completedCount: 0,
    startsAtGameTime: '2026-01-01T00:00:00Z',
    startsInSeconds: 0,
    completesAtGameTime: '2026-01-01T00:01:00Z',
    completesInSeconds: 60,
    totalSeconds: 60,
  };
}

function setup(buildings: PlacedBuildingResponse[], premium = false) {
  setActivePinia(createPinia());
  const world = useWorldStore();
  world.selectedSettlementId = 's1';
  world.hud.level = 30;
  world.hud.buildings = buildings;
  world.hud.available = { wood: 99999, stone: 99999, food: 99999, iron: 99999 };
  useAuthStore().user = { id: 'u1', isPremium: premium } as never;
  useUnitCatalogueStore().definitions = definitions;
  // Skip the network load: the store's definitions are already filled.
  useUnitCatalogueStore().load = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(world, 'refreshLiveSettlement').mockResolvedValue(undefined as never);
  return world;
}

function mountModal(building = barracks) {
  return mount(TrainingModal, {
    props: { building },
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue, apiErrors: enApiErrors })] },
  });
}

const twoBarracks = [placed('barracks', 3, -2, 7), placed('barracks', 5, 0, 20)];

describe('TrainingModal', () => {
  beforeEach(() => {
    trainUnits.mockReset().mockResolvedValue({ orders: [] });
  });

  it('names the building, its level and its training bonus', () => {
    setup([placed('barracks', 3, -2, 7)]);
    const wrapper = mountModal();
    expect(wrapper.get('.name').text()).toBe('Barracks');
    expect(wrapper.get('.sub').text()).toBe('Level 7 · training 7% faster');
  });

  it('lists only the units this building type trains', () => {
    setup([placed('barracks', 3, -2, 7)]);
    const names = mountModal().findAll('.unit-name').map((n) => n.text().toLowerCase());
    const expected = definitions.filter((d) => d.requiredBuildingType === 'barracks').map((d) => d.type);
    expect(names).toHaveLength(expected.length);
    expect(names).not.toContain('bowman');
    expect(names).not.toContain('karve');
  });

  it('offers the camp builder next to the settler at the Cart Workshop, as the live catalogue lists it', () => {
    const world = setup([placed('cartworkshop', 3, -2, 5)]);
    const settler = definitions.find((d) => d.type === 'settler')!;
    useUnitCatalogueStore().definitions = [
      ...definitions,
      { ...settler, type: 'campbuilder', trainingCost: { wood: 80, stone: 40, food: 40, iron: 20 } },
    ];
    expect(world.hud.buildings).toHaveLength(1);
    const names = mountModal(placed('cartworkshop', 3, -2, 5)).findAll('.unit-name').map((n) => n.text());
    expect(names).toContain('Settler');
    expect(names).toContain('Camp builder');
  });

  it('shows the duration with the building level factor', () => {
    setup([placed('barracks', 3, -2, 7)]);
    const thrall = definitions.find((d) => d.type === 'thrall')!;
    const wrapper = mountModal();
    const total = Math.round(thrall.trainingSeconds * 0.93);
    const text = wrapper.get('.unit-cost').text();
    const m = Math.floor(total / 60);
    const s = total % 60;
    expect(text).toContain(m > 0 ? `${m}m ${s}s` : `${s}s`);
  });

  it('hides the "Train in" selector when the settlement has only one such building', () => {
    setup([placed('barracks', 3, -2, 7), placed('archeryrange', 1, 1, 3)]);
    expect(mountModal().find('.selectors').exists()).toBe(false);
  });

  it('does not count a barracks outside the realm toward Distribute', () => {
    setup([placed('barracks', 3, -2, 7), placed('barracks', 5, 0, 20, { outsideRealmSince: '2026-01-01T00:00:00Z' })]);
    expect(mountModal().find('.selectors').exists()).toBe(false);
  });

  it('offers This building / Distribute (N) with several, and Evenly / Fastest after choosing Distribute', async () => {
    setup(twoBarracks);
    const wrapper = mountModal();
    const buttons = () => wrapper.findAll('.seg').map((b) => b.text());
    expect(buttons()).toEqual(['This building', 'Distribute (2)']);
    await wrapper.findAll('.seg')[1].trigger('click');
    expect(buttons()).toEqual(['This building', 'Distribute (2)', 'Evenly', '🔒 Fastest']);
  });

  it('locks Fastest for a non-premium account and says what premium unlocks', async () => {
    setup(twoBarracks, false);
    const wrapper = mountModal();
    await wrapper.findAll('.seg')[1].trigger('click');
    expect(wrapper.get('.seg.fastest').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.premium-note').text()).toContain('Premium');
  });

  it('enables Fastest for a premium account', async () => {
    setup(twoBarracks, true);
    const wrapper = mountModal();
    await wrapper.findAll('.seg')[1].trigger('click');
    const fastest = wrapper.get('.seg.fastest');
    expect(fastest.attributes('disabled')).toBeUndefined();
    expect(fastest.text()).toBe('Fastest');
    expect(wrapper.find('.premium-note').exists()).toBe(false);
  });

  it('sends the building hex and split "here" by default', async () => {
    setup(twoBarracks);
    const wrapper = mountModal();
    await wrapper.get('.unit-row .primary').trigger('click');
    await flushPromises();
    expect(trainUnits).toHaveBeenCalledWith('s1', { unit: 'thrall', count: 1, q: 3, r: -2, split: 'here' }, undefined);
    expect(wrapper.emitted('trained')).toHaveLength(1);
  });

  it('sends "evenly" for Distribute and "fastest" once picked by a premium account', async () => {
    setup(twoBarracks, true);
    const wrapper = mountModal();
    await wrapper.findAll('.seg')[1].trigger('click');
    await wrapper.get('.unit-row .primary').trigger('click');
    await flushPromises();
    expect(trainUnits.mock.calls[0][1]).toMatchObject({ split: 'evenly', q: 3, r: -2 });

    await wrapper.get('.seg.fastest').trigger('click');
    await wrapper.get('.unit-row .primary').trigger('click');
    await flushPromises();
    expect(trainUnits.mock.calls[1][1]).toMatchObject({ split: 'fastest' });
  });

  it('says when this building is full and disables Train, but only for "This building"', async () => {
    const world = setup(twoBarracks);
    world.hud.trainingQueue = [1, 2, 3, 4, 5].map((i) => order(3, -2, `p${i}`));
    const wrapper = mountModal();
    expect(wrapper.get('.error-note').text()).toContain('5 of 5 orders');
    expect(wrapper.get('.unit-row .primary').attributes('disabled')).toBeDefined();

    await wrapper.findAll('.seg')[1].trigger('click');
    expect(wrapper.find('.error-note').exists()).toBe(false);
    expect(wrapper.get('.unit-row .primary').attributes('disabled')).toBeUndefined();
  });

  it('does not count another building\'s orders toward this one', () => {
    const world = setup(twoBarracks);
    world.hud.trainingQueue = [1, 2, 3, 4, 5].map((i) => order(5, 0, `p${i}`));
    const wrapper = mountModal();
    expect(wrapper.find('.error-note').exists()).toBe(false);
    expect(wrapper.get('.unit-row .primary').attributes('disabled')).toBeUndefined();
  });
});

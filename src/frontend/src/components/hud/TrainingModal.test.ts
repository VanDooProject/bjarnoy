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

  it('lists the Harbour\'s ships under white job headings and names the missing building level', () => {
    setup([placed('harbour', 3, -2, 3)]);
    const wrapper = mountModal(placed('harbour', 3, -2, 3));
    expect(wrapper.findAll('.group-heading').map((h) => [h.attributes('data-group'), h.text()])).toEqual([
      ['scouts', 'Scouts'], ['cargo', 'Cargo'], ['transport', 'Transport'],
    ]);
    expect(wrapper.findAll('.unit-name').map((n) => n.text())).toEqual(['Færing', 'Byrding', 'Knarr', 'Karve']);
    const rows = wrapper.findAll('.unit-row');
    expect(rows.map((r) => r.classes().includes('locked'))).toEqual([false, false, false, true]);
    expect(rows[3]!.text()).toContain('Harbour 5 (now 3)');
  });

  it('lists the Shipyard\'s warships and fire craft in their groups', () => {
    setup([placed('shipyard', 3, -2, 10)]);
    const wrapper = mountModal(placed('shipyard', 3, -2, 10));
    expect(wrapper.findAll('.group-heading').map((h) => h.text())).toEqual(['Warships', 'Fire craft']);
    expect(wrapper.findAll('.unit-name').map((n) => n.text())).toEqual(['Snekkja', 'Skeid', 'Fire Raft', 'Fire Hulk']);
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

  it('starts every row at 0 and places nothing until a type is picked', () => {
    setup(twoBarracks);
    const wrapper = mountModal();
    expect(wrapper.findAll('.unit-row .qty').every((q) => (q.element as HTMLInputElement).value === '0')).toBe(true);
    expect(wrapper.get('.foot .primary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.foot .sum').text()).toContain('Pick units to train');
  });

  it('steps the quantity with − / + and fills the largest affordable count with Max', async () => {
    const world = setup(twoBarracks);
    // Thrall costs 60 wood: 130 wood affords 2.
    world.hud.available = { wood: 130, stone: 99999, food: 99999, iron: 99999 };
    const wrapper = mountModal();
    const row = wrapper.findAll('.unit-row')[0]!;
    const buttons = row.findAll('.step-btn');
    await buttons[1]!.trigger('click');
    await buttons[1]!.trigger('click');
    expect((row.get('.qty').element as HTMLInputElement).value).toBe('2');
    await buttons[0]!.trigger('click');
    expect((row.get('.qty').element as HTMLInputElement).value).toBe('1');
    await row.get('.max').trigger('click');
    expect((row.get('.qty').element as HTMLInputElement).value).toBe('2');
  });

  it('places one order per picked type with one button and stays open', async () => {
    setup(twoBarracks);
    const wrapper = mountModal();
    const rows = wrapper.findAll('.unit-row');
    await rows[0]!.findAll('.step-btn')[1]!.trigger('click');
    await rows[1]!.findAll('.step-btn')[1]!.trigger('click');
    await rows[1]!.findAll('.step-btn')[1]!.trigger('click');
    expect(wrapper.get('.foot .sum').text()).toContain('2 orders');
    expect(wrapper.get('.foot .primary').text()).toBe('Train 2 orders');
    await wrapper.get('.foot .primary').trigger('click');
    await flushPromises();
    expect(trainUnits).toHaveBeenCalledTimes(2);
    expect(trainUnits).toHaveBeenNthCalledWith(1, 's1', { unit: 'thrall', count: 1, q: 3, r: -2, split: 'here' }, undefined);
    expect(trainUnits).toHaveBeenNthCalledWith(2, 's1', { unit: 'spearman', count: 2, q: 3, r: -2, split: 'here' }, undefined);
    // Stays open (no close/trained event) and the picks reset.
    expect(wrapper.emitted('close')).toBeUndefined();
    expect((wrapper.findAll('.unit-row')[0]!.get('.qty').element as HTMLInputElement).value).toBe('0');
  });

  it('sends "evenly" for Distribute and "fastest" once picked by a premium account', async () => {
    setup(twoBarracks, true);
    const wrapper = mountModal();
    await wrapper.findAll('.seg')[1]!.trigger('click');
    await wrapper.get('.unit-row .step-btn:last-of-type').trigger('click');
    await wrapper.get('.foot .primary').trigger('click');
    await flushPromises();
    expect(trainUnits.mock.calls[0]![1]).toMatchObject({ split: 'evenly', q: 3, r: -2 });

    await wrapper.get('.seg.fastest').trigger('click');
    await wrapper.get('.unit-row .step-btn:last-of-type').trigger('click');
    await wrapper.get('.foot .primary').trigger('click');
    await flushPromises();
    expect(trainUnits.mock.calls[1]![1]).toMatchObject({ split: 'fastest' });
  });

  it('says when this building is full and refuses more orders, but only for "This building"', async () => {
    const world = setup(twoBarracks);
    world.hud.trainingQueue = [1, 2, 3, 4, 5].map((i) => order(3, -2, `p${i}`));
    const wrapper = mountModal();
    expect(wrapper.get('.error-note').text()).toContain('5 of 5 orders');
    await wrapper.get('.unit-row .step-btn:last-of-type').trigger('click');
    expect(wrapper.get('.foot .primary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.foot .sum').text()).toContain('Not enough free slots');

    await wrapper.findAll('.seg')[1]!.trigger('click');
    expect(wrapper.find('.error-note').exists()).toBe(false);
    expect(wrapper.get('.foot .primary').attributes('disabled')).toBeUndefined();
  });

  it('does not count another building\'s orders toward this one', () => {
    const world = setup(twoBarracks);
    world.hud.trainingQueue = [1, 2, 3, 4, 5].map((i) => order(5, 0, `p${i}`));
    const wrapper = mountModal();
    expect(wrapper.find('.error-note').exists()).toBe(false);
    expect(wrapper.findAll('.qrow')).toHaveLength(0);
    expect(wrapper.get('[data-testid="training-here"]').text()).toContain('0 of 5 slots used');
  });

  it('lists exactly the missing requirements of a locked row as chips', () => {
    // Barracks 4 (opened), Longhouse 12: the Berserker needs Barracks 10 and Longhouse 20.
    const world = setup([placed('barracks', 3, -2, 4)]);
    world.hud.level = 12;
    const wrapper = mountModal(placed('barracks', 3, -2, 4));
    const berserker = wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Berserker')!;
    expect(berserker.findAll('.chip').map((c) => c.text())).toEqual(['Barracks 10 (now 4)', 'Longhouse 20 (now 12)']);
    expect(berserker.find('.step').exists()).toBe(false);
  });

  it('gates a row on the opened building\'s level, not on another building of the type', () => {
    const world = setup([placed('barracks', 3, -2, 2), placed('barracks', 5, 0, 20)]);
    world.hud.level = 30;
    const wrapper = mountModal(placed('barracks', 3, -2, 2));
    const spearman = wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Spearman')!;
    expect(spearman.findAll('.chip').map((c) => c.text())).toEqual(['Barracks 3 (now 2)']);
  });

  it('shows the unlock ladder of this building with the reached level marked', () => {
    setup([placed('barracks', 3, -2, 7)]);
    const text = mountModal().get('[data-testid="unlock-ladder"]').text();
    expect(text).toContain('Level 1');
    expect(text).toContain('Level 3');
    expect(text).toContain('Level 10');
    expect(text).toContain('now');
  });

  it('shows this building\'s orders and cancels one after an inline confirm that names the refund', async () => {
    const world = setup(twoBarracks);
    const o = { ...order(3, -2, 'p1'), unit: 'spearman', count: 4, completedCount: 1 };
    world.hud.trainingQueue = [o];
    const cancelTraining = vi.spyOn(world, 'cancelTrainingLive').mockResolvedValue(undefined);
    const wrapper = mountModal();
    expect(wrapper.get('[data-testid="training-here"]').text()).toContain('4× Spearman');
    await wrapper.get('.qx').trigger('click');
    const spearman = definitions.find((d) => d.type === 'spearman')!;
    // 3 units not trained yet: half of 3 × the cost.
    expect(wrapper.get('.cbox').text()).toContain(`${Math.floor((spearman.trainingCost.wood * 3) / 2)} Wood`);
    expect(wrapper.get('.cbox').text()).toContain('1 already trained stay');
    expect(cancelTraining).not.toHaveBeenCalled();
    await wrapper.get('.danger').trigger('click');
    await flushPromises();
    expect(cancelTraining).toHaveBeenCalledWith('p1');
  });

  it('counts only siblings that have the unit\'s level for free slots in Distribute mode', async () => {
    // Barracks A (level 6) is full, Barracks B (level 2) is empty: the Axeman (Barracks 6) can only go to A.
    const world = setup([placed('barracks', 3, -2, 6), placed('barracks', 5, 0, 2)]);
    world.hud.trainingQueue = [1, 2, 3, 4, 5].map((i) => order(3, -2, `p${i}`));
    const wrapper = mountModal(placed('barracks', 3, -2, 6));
    await wrapper.findAll('.seg')[1]!.trigger('click');
    const axeman = wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Axeman')!;
    await axeman.findAll('.step-btn')[1]!.trigger('click');
    expect(wrapper.get('.foot .primary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.foot .sum').text()).toContain('Not enough free slots');
    // The Thrall (level 1) fits in B.
    await axeman.findAll('.step-btn')[0]!.trigger('click');
    await wrapper.findAll('.unit-row')[0]!.findAll('.step-btn')[1]!.trigger('click');
    expect(wrapper.get('.foot .primary').attributes('disabled')).toBeUndefined();
  });

  it('counts the buildings that have the level in the Distribute button', async () => {
    setup([placed('barracks', 3, -2, 6), placed('barracks', 5, 0, 2), placed('barracks', 7, 0, 6)]);
    const wrapper = mountModal(placed('barracks', 3, -2, 6));
    await wrapper.findAll('.seg')[1]!.trigger('click');
    // Nothing picked: the most buildings any unlocked unit can spread over (the Thrall: all three).
    expect(wrapper.findAll('.seg')[1]!.text()).toBe('Distribute (3)');
    const axeman = wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Axeman')!;
    await axeman.findAll('.step-btn')[1]!.trigger('click');
    expect(wrapper.findAll('.seg')[1]!.text()).toBe('Distribute (2)');
  });

  it('unlocks a row in Distribute mode from a building below the level when a sibling has it, but not in "This building"', async () => {
    setup([placed('barracks', 3, -2, 2), placed('barracks', 5, 0, 6)]);
    const wrapper = mountModal(placed('barracks', 3, -2, 2));
    const spearman = () => wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Spearman')!;
    expect(spearman().findAll('.chip')).toHaveLength(1);
    await wrapper.findAll('.seg')[1]!.trigger('click');
    expect(spearman().findAll('.chip')).toHaveLength(0);
    await spearman().findAll('.step-btn')[1]!.trigger('click');
    await wrapper.get('.foot .primary').trigger('click');
    await flushPromises();
    expect(trainUnits).toHaveBeenCalledWith('s1', { unit: 'spearman', count: 1, q: 3, r: -2, split: 'evenly' }, undefined);
  });

  it('reads the open building\'s level live, so an upgrade that finishes while open updates subtitle, rows and ladder', async () => {
    const world = setup([placed('barracks', 3, -2, 2)]);
    const wrapper = mountModal(placed('barracks', 3, -2, 2));
    expect(wrapper.get('.sub').text()).toContain('Level 2');
    const spearman = () => wrapper.findAll('.unit-row').find((r) => r.get('.unit-name').text() === 'Spearman')!;
    expect(spearman().findAll('.chip')).toHaveLength(1);

    world.hud.buildings = [placed('barracks', 3, -2, 3)];
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.sub').text()).toContain('Level 3');
    expect(spearman().findAll('.chip')).toHaveLength(0);
    expect(wrapper.get('[data-testid="unlock-ladder"] .now').element.closest('.stop')!.textContent).toContain('Level 3');
  });

  it('disables + once the row is at the largest affordable count', async () => {
    const world = setup(twoBarracks);
    world.hud.available = { wood: 130, stone: 99999, food: 99999, iron: 99999 };
    const wrapper = mountModal();
    const plus = wrapper.findAll('.unit-row')[0]!.findAll('.step-btn')[1]!;
    await plus.trigger('click');
    await plus.trigger('click');
    expect(plus.attributes('disabled')).toBeDefined();
  });
});

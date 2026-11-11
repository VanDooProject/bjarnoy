// @vitest-environment jsdom
//
// The panel shows renown, the settler count and the convoys. Sending settlers out is the map ring's job, so there is
// no founding form here, and the renown it shows is the world store's (the ring reads the same figure).
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ExpansionPanel from './ExpansionPanel.vue';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enApiErrors from '../../i18n/locales/en/apiErrors.json';
import unitCatalogue from '../../data/unit-catalogue.json';
import { ApiError } from '../../api/client';
import type { UnitDefinitionResponse } from '../../api/types';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});

const api = vi.hoisted(() => ({
  getRenown: vi.fn(),
  getSettlement: vi.fn(),
  getSettlementArmies: vi.fn(),
  listMySettlements: vi.fn(),
  getUnitCatalogue: vi.fn(),
  dispatchArmy: vi.fn(),
  trainUnits: vi.fn(),
  recallArmy: vi.fn(),
  getSettlementGuests: vi.fn(),
  getArmy: vi.fn(),
}));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, ...api } };
});

const definitions = unitCatalogue.data as UnitDefinitionResponse[];

async function mountPanel(selectedIsCamp = false) {
  setActivePinia(createPinia());
  const world = useWorldStore();
  world.selectedSettlementId = 's1';
  world.worldId = 'w1';
  vi.spyOn(world.model, 'isBeachCamp').mockReturnValue(selectedIsCamp);
  useAuthStore().user = { id: 'u1', email: 'a@b.c' } as never;
  useUnitCatalogueStore().definitions = definitions;
  const wrapper = mount(ExpansionPanel, {
    global: { plugins: [createTestI18n({ hud: enHud, apiErrors: enApiErrors })] },
  });
  await flushPromises();
  return wrapper;
}

describe('ExpansionPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.getRenown.mockResolvedValue({ total: 99, settlementCount: 1, requiredForNextSettlement: 10, canFoundAnother: true });
    api.getSettlement.mockResolvedValue({ garrison: [{ unit: 'settler', count: 5 }] });
    api.getSettlementArmies.mockResolvedValue([]);
    api.listMySettlements.mockResolvedValue([]);
    api.dispatchArmy.mockResolvedValue({});
    api.trainUnits.mockResolvedValue({ orders: [] });
    api.recallArmy.mockResolvedValue({});
    api.getSettlementGuests.mockResolvedValue([]);
    api.getArmy.mockImplementation(async (id: string) => ({ id, mission: 'found', atHome: false, supporting: false }));
  });

  it('has no founding form: the ring sends settlers', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('input[aria-label="Target Q"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Provisions"]').exists()).toBe(false);
    expect(wrapper.find('.expansion-form').exists()).toBe(false);
  });

  it('loads renown into the world store and shows it from there', async () => {
    const wrapper = await mountPanel();
    expect(api.getRenown).toHaveBeenCalledWith('w1');
    expect(useWorldStore().hud.renown?.total).toBe(99);
    expect(wrapper.text()).toContain('99');
  });

  it('trains the five settlers in a cart workshop, and cannot without one', async () => {
    const wrapper = await mountPanel();
    const trainButton = () => wrapper.findAll('button.expansion-button').find((b) => b.text().includes('settlers'))!;
    expect(trainButton().attributes('disabled')).toBeDefined();

    useWorldStore().hud.buildings = [{ type: 'cartworkshop', q: 4, r: -1, level: 2 }];
    await wrapper.vm.$nextTick();
    expect(trainButton().attributes('disabled')).toBeUndefined();
    await trainButton().trigger('click');
    await flushPromises();
    expect(api.trainUnits).toHaveBeenCalledWith('s1', { unit: 'settler', count: 5, q: 4, r: -1, split: 'evenly' });
  });

  it('names a camp in the switcher and offers no settler training when the selected settlement is a camp', async () => {
    api.listMySettlements.mockResolvedValue([
      { id: 's1', name: 'Fjordholm', q: 0, r: 0, isBeachCamp: false },
      { id: 's2', name: 'Sandspit', q: 9, r: 1, isBeachCamp: true },
    ]);
    const wrapper = await mountPanel(true);
    expect(wrapper.findAll('#settlement-switcher option').map((o) => o.text())).toEqual(['Fjordholm', 'Sandspit (Beach camp)']);
    // The camp has nothing to train in: neither the settler count nor the button is left.
    expect(wrapper.text()).not.toContain('Settlers in garrison');
    expect(wrapper.findAll('button.expansion-button').some((b) => b.text().includes('settlers'))).toBe(false);
  });

  describe('recalling a founding convoy', () => {
    const convoy = { id: 'army-1', mission: 'found', atHome: false, supporting: false, position: { q: 2, r: 3 } };

    it('recalls through the shared recall (with the owner) and refreshes the convoy list', async () => {
      api.getSettlementArmies.mockResolvedValue([convoy]);
      const wrapper = await mountPanel();
      const callsBefore = api.getSettlementArmies.mock.calls.length;
      await wrapper.findAll('.expansion-convoys .expansion-button-small')[0].trigger('click');
      await flushPromises();
      expect(api.recallArmy).toHaveBeenCalledWith('army-1', undefined);
      expect(api.getSettlementArmies.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(wrapper.find('.recall-refusal').exists()).toBe(false);
    });

    it('a refused recall (409) shows the translated rejection on that convoy row', async () => {
      api.getSettlementArmies.mockResolvedValue([convoy, { ...convoy, id: 'army-2' }]);
      api.recallArmy.mockRejectedValue(
        new ApiError(409, { title: 'Nothing to recall.', detail: 'The army is already heading home.', status: 409, rejection: 'NothingToRecall' }),
      );
      const wrapper = await mountPanel();
      const rows = wrapper.findAll('.expansion-convoys .status-row');
      await rows[1].findAll('.expansion-button-small')[0].trigger('click');
      await flushPromises();

      expect(wrapper.findAll('.recall-refusal')).toHaveLength(1);
      expect(wrapper.findAll('.expansion-convoys .status-row')[1].get('.recall-refusal').text()).toBe('The army is already heading home.');
    });
  });
});

// @vitest-environment jsdom
//
// The simulator runs the same attack a real one does, so a fleet's result shows the ship fight and then the land fight, in the
// same report card as a real battle report.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import SimulatorView from './SimulatorView.vue';
import { useAuthStore } from '../stores/auth';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import unitCatalogue from '../data/unit-catalogue.json';
import type { SimulatorResponse, UnitDefinitionResponse, UserResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enSimulator from '../i18n/locales/en/simulator.json';

const simulate = vi.hoisted(() => vi.fn());
// DEMO_MODE (a module-level constant) swaps the whole form for a hint; the live form is what is under test.
vi.mock('../config', () => ({ DEMO_MODE: false, API_BASE_URL: '/api/v1' }));
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { ...actual.api, simulate } };
});

const fleetResult: SimulatorResponse = {
  mission: 'attack',
  winner: 'attacker',
  attackPower: 3520,
  defensePower: 735,
  attackerVolleyPower: 0,
  defenderVolleyPower: 0,
  seed: 4242,
  lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
  attackerLines: [{ unit: 'axeman', sent: 80, lost: 14, survived: 66, volleyLost: 0 }],
  defenderLines: [{ unit: 'spearman', lost: 20, survived: 0, volleyLost: 0 }],
  siege: null,
  shipFight: {
    attackerLines: [{ unit: 'longship', sent: 5, lost: 1, survived: 4, volleyLost: 0 }],
    defenderLines: [{ unit: 'longship', lost: 1, survived: 0, volleyLost: 0 }],
    attackPower: 450,
    defensePower: 42,
    winner: 'attacker',
  },
  drowned: [],
  fireShipsBurned: 0,
  fireSiege: null,
};

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const wrapper = mount(SimulatorView, {
    global: {
      plugins: [createTestI18n({ simulator: enSimulator, hud: enHud }), router],
      stubs: { LocaleSwitcher: true },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useUnitCatalogueStore().definitions = unitCatalogue.data as UnitDefinitionResponse[];
  useAuthStore().user = { role: 'player', isPremium: true } as unknown as UserResponse;
  simulate.mockReset();
  simulate.mockResolvedValue(fleetResult);
});

describe('SimulatorView', () => {
  it('sends the fleet as one attack and shows the ship fight before the land fight', async () => {
    const wrapper = await mountView();

    const longship = wrapper.findAll('.stack-section')[0]!.findAll('label').find((l) => l.text() === 'longship')!;
    await longship.get('input').setValue('5');
    const axeman = wrapper.findAll('.stack-section')[0]!.findAll('label').find((l) => l.text() === 'axeman')!;
    await axeman.get('input').setValue('80');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(simulate).toHaveBeenCalledOnce();
    expect(simulate.mock.calls[0]![0].attackerStacks).toEqual([
      { unit: 'longship', count: 5 },
      { unit: 'axeman', count: 80 },
    ]);
    const ship = wrapper.get('[data-testid=ship-fight]');
    expect(ship.text()).toContain('450');
    const land = wrapper.get('[data-testid=land-fight]');
    expect(land.text()).toContain('3520');
    const html = wrapper.html();
    expect(html.indexOf('data-testid="ship-fight"')).toBeLessThan(html.indexOf('data-testid="land-fight"'));
  });

  it('shows a land army simulation as the one fight it is', async () => {
    simulate.mockResolvedValue({ ...fleetResult, shipFight: null });
    const wrapper = await mountView();

    const axeman = wrapper.findAll('.stack-section')[0]!.findAll('label').find((l) => l.text() === 'axeman')!;
    await axeman.get('input').setValue('20');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid=ship-fight]').exists()).toBe(false);
    expect(wrapper.get('[data-testid=land-fight]').text()).toContain('3520');
  });
});

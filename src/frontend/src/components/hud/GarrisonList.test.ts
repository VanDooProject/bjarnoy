// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import GarrisonList from './GarrisonList.vue';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { UnitDefinitionResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function def(type: string, upkeepPerHour: number): UnitDefinitionResponse {
  return { type, upkeepPerHour } as UnitDefinitionResponse;
}

function seed() {
  const world = useWorldStore();
  const catalogue = useUnitCatalogueStore();
  // Set directly so load() (which only fetches while the list is empty) stays a no-op.
  catalogue.definitions = [def('karve', 1.5), def('longship', 2), def('axeman', 0.5), def('bowman', 0.5)];
  world.hud.garrison = [
    { unit: 'karve', count: 3004 },
    { unit: 'longship', count: 2008 },
  ];
  world.guestArmies = [
    {
      armyId: 'guest-1',
      ownerSettlementId: 'unknown',
      totalUpkeepPerHour: 0,
      stacks: [
        { unit: 'axeman', count: 120 },
        { unit: 'bowman', count: 40 },
      ],
    },
  ] as typeof world.guestArmies;
  return world;
}

function mountList() {
  return mount(GarrisonList, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

describe('GarrisonList', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sums own garrison and guest armies into the Upkeep line', () => {
    seed();
    const sum = mountList().get('[data-testid="garrison-upkeep"]');
    // 3004*1.5 + 2008*2 + 120*0.5 + 40*0.5 = 4506 + 4016 + 60 + 20
    expect(sum.text()).toContain('Upkeep');
    expect(sum.text()).toContain('−8,602/h');
  });

  it('renders a food per hour value on own rows and each guest unit row, and the army total', () => {
    seed();
    const text = mountList().text();
    expect(text).toContain('4,506/h');
    expect(text).toContain('4,016/h');
    expect(text).toContain('60/h');
    expect(text).toContain('20/h');
    // the guest army's own total: 60 + 20
    expect(text).toContain('80/h');
  });

  it('lists guest units as separate rows, not a comma string', () => {
    seed();
    const wrapper = mountList();
    expect(wrapper.findAll('.garrison-row')).toHaveLength(4);
    expect(wrapper.text()).not.toContain(', ');
    expect(wrapper.text()).not.toMatch(/120× Axeman, 40× Bowman/);
    const guestUnits = wrapper.findAll('.guest-units .garrison-row');
    expect(guestUnits.map((r) => r.find('.garrison-count').text())).toEqual(['120', '40']);
  });

  it('shows the runs-out line only while the net food rate is negative and food is left', async () => {
    const world = seed();
    world.hud.resources.food = 1000;
    world.hud.rates.food = 100;
    const wrapper = mountList();
    expect(wrapper.find('[data-testid="garrison-runs-out"]').exists()).toBe(false);
    expect(wrapper.get('.upkeep-sum').classes()).not.toContain('is-starving');

    world.hud.rates.food = -500;
    await wrapper.vm.$nextTick();
    // 1000 / 500 = 2 h
    expect(wrapper.get('[data-testid="garrison-runs-out"]').text()).toBe('Food runs out in 2h00');
    expect(wrapper.get('.upkeep-sum').classes()).toContain('is-starving');

    world.hud.resources.food = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="garrison-runs-out"]').exists()).toBe(false);
  });

  it('toggles the shown state when the Upkeep line is clicked', async () => {
    seed();
    const wrapper = mountList();
    const sum = wrapper.get('.upkeep-sum');
    expect(sum.attributes('aria-pressed')).toBe('false');
    expect(wrapper.classes()).not.toContain('is-rates-shown');
    expect(wrapper.text()).toContain('Tap for food per unit type');

    await sum.trigger('click');
    expect(sum.attributes('aria-pressed')).toBe('true');
    expect(wrapper.classes()).toContain('is-rates-shown');
    expect(wrapper.text()).toContain('Tap to hide food per unit type');

    await sum.trigger('click');
    expect(sum.attributes('aria-pressed')).toBe('false');
    expect(wrapper.classes()).not.toContain('is-rates-shown');
  });

  it('shows the empty note and no Upkeep line without any units', () => {
    useWorldStore();
    const wrapper = mountList();
    expect(wrapper.text()).toContain('No units standing here yet.');
    expect(wrapper.find('.upkeep-sum').exists()).toBe(false);
  });
});

// @vitest-environment jsdom
//
// The founding convoy is 5 settlers; the backend rejects provisions above
// their combined foodCarryCapacity (ProvisionsExceedCarryCapacity), so the
// form must default to and be capped at that total.
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
}));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, ...api } };
});

const definitions = unitCatalogue.data as UnitDefinitionResponse[];
const settlerCarry = definitions.find((d) => d.type === 'settler')!.foodCarryCapacity;

async function mountPanel() {
  setActivePinia(createPinia());
  const world = useWorldStore();
  world.selectedSettlementId = 's1';
  world.worldId = 'w1';
  useAuthStore().user = { id: 'u1', email: 'a@b.c' } as never;
  useUnitCatalogueStore().definitions = definitions;
  const wrapper = mount(ExpansionPanel, {
    global: { plugins: [createTestI18n({ hud: enHud, apiErrors: enApiErrors })] },
  });
  await flushPromises();
  return wrapper;
}

describe('ExpansionPanel provisions', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.getRenown.mockResolvedValue({ total: 99, settlementCount: 1, requiredForNextSettlement: 10, canFoundAnother: true });
    api.getSettlement.mockResolvedValue({ garrison: [{ unit: 'settler', count: 5 }] });
    api.getSettlementArmies.mockResolvedValue([]);
    api.listMySettlements.mockResolvedValue([]);
    api.dispatchArmy.mockResolvedValue({});
  });

  it('defaults to the five settlers combined carry capacity and shows it as the max', async () => {
    const wrapper = await mountPanel();
    const input = wrapper.find<HTMLInputElement>('input[aria-label="Provisions"]');
    expect(settlerCarry).toBeGreaterThan(0);
    expect(input.element.value).toBe(String(settlerCarry * 5));
    expect(input.attributes('max')).toBe(String(settlerCarry * 5));
    expect(wrapper.text()).toContain(`max ${settlerCarry * 5}`);
  });

  it('clamps a value above the carry capacity before dispatching', async () => {
    const wrapper = await mountPanel();
    const input = wrapper.find<HTMLInputElement>('input[aria-label="Provisions"]');
    input.element.value = '500';
    await input.trigger('input');
    expect(input.element.value).toBe(String(settlerCarry * 5));
    await wrapper.find('.expansion-form button.expansion-button').trigger('click');
    await flushPromises();
    expect(api.dispatchArmy).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ provisions: settlerCarry * 5, mission: 'found' }),
    );
  });
});

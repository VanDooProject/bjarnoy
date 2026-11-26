// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DispatchProvisionsField from './DispatchProvisionsField.vue';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { UnitDefinitionResponse } from '../../api/types';
import unitSnapshot from '../../data/unit-catalogue.json';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

const spearman = (unitSnapshot.data as UnitDefinitionResponse[]).find((u) => u.type === 'spearman')!;

function setup(food = 100_000) {
  const world = useWorldStore();
  world.hud.available.food = food;
  useUnitCatalogueStore().definitions = unitSnapshot.data as UnitDefinitionResponse[];
  world.selectedSettlementId = 'home-1';
  world.startDispatch();
  world.dispatchDraft!.unitCounts = { spearman: 3 };
  const wrapper = mount(DispatchProvisionsField, { global: { plugins: [createTestI18n({ hud: enHud })] } });
  return { world, wrapper, capacity: spearman.foodCarryCapacity * 3 };
}

describe('DispatchProvisionsField', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('takes a figure the units can carry as typed', async () => {
    const { world, wrapper, capacity } = setup();
    await wrapper.get('input').setValue(String(capacity - 1));
    expect(world.dispatchDraft!.provisions).toBe(capacity - 1);
  });

  it('cuts a figure above what the units can carry down to their capacity, in the store and in the field', async () => {
    const { world, wrapper, capacity } = setup();
    expect(wrapper.get('input').attributes('max')).toBe(String(capacity));

    await wrapper.get('input').setValue(String(capacity * 10));
    expect(world.dispatchDraft!.provisions).toBe(capacity);
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(String(capacity));

    // Typing over the cap again leaves the stored figure as it was: the field still shows the cap, not the typed figure.
    await wrapper.get('input').setValue(String(capacity + 5));
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(String(capacity));
  });

  it('cuts a figure above the realm\'s free food down to that food, even when the units could carry more', async () => {
    const { world, wrapper, capacity } = setup(spearman.foodCarryCapacity);
    expect(capacity).toBeGreaterThan(spearman.foodCarryCapacity);
    expect(wrapper.get('input').attributes('max')).toBe(String(spearman.foodCarryCapacity));

    await wrapper.get('input').setValue(String(capacity));
    expect(world.dispatchDraft!.provisions).toBe(spearman.foodCarryCapacity);
  });

  it('allows no food when no unit is chosen', async () => {
    const { world, wrapper } = setup();
    world.dispatchDraft!.unitCounts = {};
    await wrapper.get('input').setValue('50');
    expect(world.dispatchDraft!.provisions).toBe(0);
  });
});

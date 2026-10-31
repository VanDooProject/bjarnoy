// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, defineComponent, h, markRaw } from 'vue';
import { useWorldStore } from '../stores/world';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import type { UnitDefinitionResponse } from '../api/types';
import { useDispatchTargetBuilding } from './useDispatchTargetBuilding';

function unit(type: string, cls: string, siegeTargets: string[] = []): UnitDefinitionResponse {
  return { type, class: cls, siegeTargets } as UnitDefinitionResponse;
}

// Land at q >= 0, sea at q < 0: (0,r) is shoreline, (3,r) is inland, (-1,r) is a sea hex.
const COAST = { isLand: (q: number) => q >= 0 };

function setup(unitCounts: Record<string, number>) {
  setActivePinia(createPinia());
  const world = useWorldStore();
  world.model = markRaw(COAST) as unknown as typeof world.model;
  useUnitCatalogueStore().definitions = [
    unit('karve', 'ship', ['walls', 'towers', 'buildings']),
    unit('catapult', 'siege', ['towers', 'buildings']),
    unit('ram', 'siege', ['walls', 'towers']),
    unit('spearman', 'infantry'),
  ];
  world.startDispatch();
  world.setDispatchMission('attack');
  world.dispatchDraft!.unitCounts = unitCounts;
  world.dispatchDraft!.targetSettlementId = 'target-1';
  world.dispatchTargetBuildingsFor = 'target-1';
  world.dispatchTargetBuildings = [
    { q: 3, r: 0, type: 'farm', level: 4 },
    { q: 2, r: 0, type: 'palisade', level: 3 },
    { q: 0, r: 0, type: 'fishing_hut', level: 2 },
    { q: -1, r: 0, type: 'dockyard', level: 1 },
  ];
  let picker: ReturnType<typeof useDispatchTargetBuilding> | null = null;
  const Host = defineComponent({
    setup() {
      picker = useDispatchTargetBuilding(computed(() => true));
      return () => h('div');
    },
  });
  mount(Host, { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });
  return { world, picker: picker! as ReturnType<typeof useDispatchTargetBuilding> };
}

describe('useDispatchTargetBuilding', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('offers a fleet only the buildings on the target shore and requires a pick', () => {
    const { world, picker } = setup({ karve: 3 });

    expect(picker.showPicker.value).toBe(true);
    expect(picker.isRequired.value).toBe(true);
    expect(picker.rows.value.map((r) => `${r.q},${r.r}`)).toEqual(['0,0', '-1,0']);
    expect(picker.rows.value.every((r) => r.damageable)).toBe(true);
    expect(picker.isMissingRequiredPick.value).toBe(true);

    picker.pick(0, 0);
    expect(world.dispatchDraft!.targetBuildingCoord).toEqual({ q: 0, r: 0 });
    expect(picker.isMissingRequiredPick.value).toBe(false);
  });

  it('offers a catapult attack every building and does not require a pick', () => {
    const { picker } = setup({ catapult: 3 });

    expect(picker.showPicker.value).toBe(true);
    expect(picker.isRequired.value).toBe(false);
    expect(picker.rows.value).toHaveLength(4);
    expect(picker.isMissingRequiredPick.value).toBe(false);
  });

  it('marks the buildings the selected engines cannot damage and warns about an unreachable pick', () => {
    const { picker, world } = setup({ catapult: 3 });
    expect(Object.fromEntries(picker.rows.value.map((r) => [`${r.q},${r.r}`, r.damageable]))).toMatchObject({ '2,0': false, '3,0': true });
    expect(picker.selectedUnreachable.value).toBe(false);

    picker.pick(2, 0);
    expect(picker.selectedUnreachable.value).toBe(true);

    world.dispatchDraft!.unitCounts = { ram: 1 };
    expect(picker.selectedUnreachable.value).toBe(false);
  });

  it('shows no picker for a plain land attack', () => {
    const { picker } = setup({ spearman: 5 });

    expect(picker.showPicker.value).toBe(false);
    expect(picker.isMissingRequiredPick.value).toBe(false);
  });
});

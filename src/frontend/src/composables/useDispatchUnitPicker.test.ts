// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatchUnitPicker } from './useDispatchUnitPicker';
import { useWorldStore } from '../stores/world';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import type { UnitDefinitionResponse } from '../api/types';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry', attack: 0, defense: 0, speed: 1, visionRadius: 2, carryCapacity: 0, foodCarryCapacity: 10,
    cargoSlots: 1, shipSlots: 0, upkeepPerHour: 1, trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
    ...overrides,
  } as UnitDefinitionResponse;
}

const rows = computed(() => ['settler', 'spearman', 'karve'].map((u) => ({ unit: u })));

describe('useDispatchUnitPicker for a founding convoy', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useUnitCatalogueStore().definitions = [
      unit({ type: 'settler' }),
      unit({ type: 'spearman' }),
      unit({ type: 'karve', class: 'ship', cargoSlots: 0, shipSlots: 10 }),
    ];
    useWorldStore().startDispatchAt({ q: 4, r: -1 }, { mission: 'found' });
  });

  it('locks the settler row and leaves ships and land escorts selectable', () => {
    const picker = useDispatchUnitPicker(rows);
    expect(picker.isFound.value).toBe(true);
    expect(picker.isRowSelectable('settler')).toBe(false);
    expect(picker.isRowSelectable('spearman')).toBe(true);
    expect(picker.isRowSelectable('karve')).toBe(true);
  });

  it('blocks sending when settlers plus escorts exceed the ships\' slots', () => {
    const world = useWorldStore();
    const picker = useDispatchUnitPicker(rows);
    world.setDispatchUnitCount('karve', 1);
    world.setDispatchUnitCount('spearman', 5); // 5 settlers + 5 escorts = 10 of 10
    expect(picker.overCapacity.value).toBe(false);
    expect(picker.selectionSendable.value).toBe(true);
    world.setDispatchUnitCount('spearman', 6);
    expect(picker.overCapacity.value).toBe(true);
    expect(picker.selectionSendable.value).toBe(false);
  });
});

describe('useDispatchUnitPicker for a hunt', () => {
  function startHuntAt(family: string) {
    setActivePinia(createPinia());
    useUnitCatalogueStore().definitions = [
      unit({ type: 'settler' }),
      unit({ type: 'spearman' }),
      unit({ type: 'karve', class: 'ship', cargoSlots: 0, shipSlots: 10 }),
    ];
    const world = useWorldStore();
    vi.spyOn(world.model, 'campAt').mockReturnValue({ family } as ReturnType<typeof world.model.campAt>);
    world.startDispatchAt({ q: 4, r: -1 }, { mission: 'hunt' });
    return world;
  }

  it('a sand camp leaves ships selectable as carriers but needs land troops aboard and enough slots', () => {
    const world = startHuntAt('sealhaulout');
    const picker = useDispatchUnitPicker(rows);
    expect(picker.huntOnSand.value).toBe(true);
    expect(picker.isRowSelectable('karve')).toBe(true);
    expect(picker.hasLockedOutUnits.value).toBe(false);

    world.setDispatchUnitCount('karve', 1);
    expect(picker.sandHuntLacksTroops.value).toBe(true);
    expect(picker.selectionSendable.value).toBe(false);

    world.setDispatchUnitCount('spearman', 10);
    expect(picker.sandHuntLacksTroops.value).toBe(false);
    expect(picker.selectionSendable.value).toBe(true);
    world.setDispatchUnitCount('spearman', 11);
    expect(picker.selectionSendable.value).toBe(false);
  });

  it('a land troop alone may hunt a sand camp', () => {
    const world = startHuntAt('walrushaulout');
    const picker = useDispatchUnitPicker(rows);
    world.setDispatchUnitCount('spearman', 3);
    expect(picker.selectionSendable.value).toBe(true);
  });

  it('a land camp other than sand keeps the ships greyed out', () => {
    startHuntAt('wolfden');
    const picker = useDispatchUnitPicker(rows);
    expect(picker.huntOnSand.value).toBe(false);
    expect(picker.isRowSelectable('karve')).toBe(false);
    expect(picker.isRowSelectable('spearman')).toBe(true);
    expect(picker.hasLockedOutUnits.value).toBe(true);
  });
});

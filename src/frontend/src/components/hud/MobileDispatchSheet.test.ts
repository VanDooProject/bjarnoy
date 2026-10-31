// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileDispatchSheet from './MobileDispatchSheet.vue';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import unitSnapshot from '../../data/unit-catalogue.json';
import type { UnitDefinitionResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: true };
});

function mountSheet() {
  return mount(MobileDispatchSheet, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

describe('MobileDispatchSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows the demo note and disables Start in demo mode even with a valid draft', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatchAt({ q: 1, r: 1 });
    world.setDispatchUnitCount('spearman', 5);

    const wrapper = mountSheet();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Dispatching armies requires the live backend');
    const start = wrapper.get('.primary');
    expect((start.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('the Units button counts selected units, not unit types', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }, { unit: 'catapult', count: 2 }];
    world.startDispatchAt({ q: 1, r: 1 });
    world.setDispatchUnitCount('spearman', 3);
    world.setDispatchUnitCount('catapult', 2);

    const wrapper = mountSheet();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('button.grip').text()).toBe('Units (5)');
  });

  it('disables Start with no units selected', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatchAt({ q: 1, r: 1 });

    const wrapper = mountSheet();
    await wrapper.vm.$nextTick();

    expect((wrapper.get('.primary').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Start with no destination (Attack mission, no target yet)', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatch();
    world.setDispatchMission('attack');
    world.setDispatchUnitCount('spearman', 5);

    const wrapper = mountSheet();
    await wrapper.vm.$nextTick();

    expect((wrapper.get('.primary').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens expanded for a fresh dispatch draft (units still need picking)', () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatchAt({ q: 1, r: 1 });

    const wrapper = mountSheet();
    expect(wrapper.find('.dispatch-sheet-expanded').exists()).toBe(true);
    expect(wrapper.find('.unit-steppers').exists()).toBe(true);
  });

  it('opens collapsed for a field order (no units/mission section)', () => {
    const world = useWorldStore();
    world.armies = [];
    world.startFieldOrder('army-1');

    const wrapper = mountSheet();
    expect(wrapper.find('.dispatch-sheet-expanded').exists()).toBe(false);
    // Expand via the middle button — a field order still has a stops list.
    return wrapper.vm.$nextTick().then(async () => {
      await wrapper.get('.dispatch-sheet-row2 .grip').trigger('click');
      expect(wrapper.find('.unit-steppers').exists()).toBe(false);
    });
  });

  it('Undo pops the last waypoint', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatchAt({ q: 1, r: 1 });
    world.addWaypoint({ q: 2, r: 2 });

    const wrapper = mountSheet();
    await wrapper.get('.dispatch-sheet-row2 .secondary:not(.grip)').trigger('click');

    expect(world.dispatchDraft?.route).toEqual([{ q: 1, r: 1 }]);
  });

  it('the cancel (✕) button clears the draft', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    world.startDispatchAt({ q: 1, r: 1 });

    const wrapper = mountSheet();
    await wrapper.get('.sheet-cancel').trigger('click');

    expect(world.dispatchDraft).toBeNull();
  });

  it('clamps a unit stepper at the garrison count and at zero', async () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 2 }];
    world.startDispatchAt({ q: 1, r: 1 });

    const wrapper = mountSheet();
    const [decrementBtn, incrementBtn] = wrapper.findAll('.stepper-btn');

    // Already at 0 — decrement is disabled and a click is a no-op.
    expect((decrementBtn.element as HTMLButtonElement).disabled).toBe(true);
    await incrementBtn.trigger('click');
    await incrementBtn.trigger('click');
    expect(world.dispatchDraft?.unitCounts.spearman).toBe(2);
    await incrementBtn.trigger('click'); // would overshoot the garrison's 2
    expect(world.dispatchDraft?.unitCounts.spearman).toBe(2);

    await decrementBtn.trigger('click');
    expect(world.dispatchDraft?.unitCounts.spearman).toBe(1);
  });

  describe('target-building picker', () => {
    const buildings = [
      { q: 1, r: 0, type: 'longhouse', level: 5 },
      { q: 2, r: 0, type: 'tower', level: 3 },
      { q: 3, r: 0, type: 'palisade', level: 2 },
      { q: 4, r: 0, type: 'bridge', level: 4 },
    ];

    function attackDraft(units: Record<string, number>) {
      const world = useWorldStore();
      useUnitCatalogueStore().definitions = unitSnapshot.data as UnitDefinitionResponse[];
      world.hud.garrison = Object.entries(units).map(([unit, count]) => ({ unit, count }));
      vi.spyOn(world, 'listAttackableSettlements').mockReturnValue([{ id: 'rival', name: 'Rival', ownerName: 'Astrid', q: 9, r: 9 }]);
      world.startDispatchAt({ q: 3, r: 0 }, { mission: 'attack', targetSettlementId: 'rival', targetBuildingCoord: { q: 3, r: 0 } });
      world.dispatchTargetBuildings = buildings as never;
      world.dispatchTargetBuildingsFor = 'rival';
      world.dispatchTargetBuildingsLoading = false;
      for (const [unit, count] of Object.entries(units)) world.setDispatchUnitCount(unit, count);
      return world;
    }

    async function pickerRows(units: Record<string, number>) {
      const world = attackDraft(units);
      world.setDispatchTargetBuilding(null);
      const wrapper = mountSheet();
      await wrapper.vm.$nextTick();
      return wrapper.findAll('[data-testid="building-target"]').map((row) => ({
        text: row.text(),
        disabled: (row.element as HTMLButtonElement).disabled,
      }));
    }

    it('lets rams pick walls and towers only', async () => {
      const rows = await pickerRows({ ram: 2 });

      expect(rows.map((r) => r.disabled)).toEqual([true, false, false, true]);
    });

    it('lets catapults pick everything but walls', async () => {
      const rows = await pickerRows({ catapult: 2 });

      expect(rows.map((r) => r.disabled)).toEqual([false, false, true, false]);
    });

    it('lets a mixed army pick every target', async () => {
      const rows = await pickerRows({ catapult: 1, ram: 1 });

      expect(rows.every((r) => !r.disabled)).toBe(true);
    });

    it('says what a target the engines cannot damage is, and states each engine\'s reach', async () => {
      const world = attackDraft({ ram: 1 });
      world.setDispatchTargetBuilding(null);
      const wrapper = mountSheet();
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="engine-reach"]').text()).toContain('Rams breach walls and towers');
      expect(wrapper.findAll('[data-testid="building-target"]')[0]!.text()).toContain("can't damage this");
    });

    it('warns when the wall the ring pre-selected is out of reach of the selected engines', async () => {
      attackDraft({ catapult: 2 }); // the draft keeps the wall hex (3, 0) as its preferred target
      const wrapper = mountSheet();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="target-unreachable"]').exists()).toBe(true);

      useWorldStore().setDispatchUnitCount('ram', 1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="target-unreachable"]').exists()).toBe(false);
    });

    it('is not shown without a siege engine in the selection', async () => {
      const rows = await pickerRows({ spearman: 5 });

      expect(rows).toEqual([]);
    });
  });
});

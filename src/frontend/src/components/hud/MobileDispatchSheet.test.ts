// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileDispatchSheet from './MobileDispatchSheet.vue';
import { useWorldStore } from '../../stores/world';
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
});

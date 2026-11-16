// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ArmyPanel from './ArmyPanel.vue';
import { useWorldStore } from '../../stores/world';
import type { ArmyResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import { ApiError } from '../../api/client';

const { recallArmy } = vi.hoisted(() => ({ recallArmy: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, recallArmy } };
});

function army(overrides: Partial<ArmyResponse> = {}): ArmyResponse {
  return {
    id: 'army-1',
    settlementId: 'settlement-1',
    mission: 'move',
    targetSettlementId: null,
    atHome: false,
    supporting: false,
    position: { q: 1, r: 1 },
    provisions: 10,
    totalSpeed: 4,
    visionRadius: 2,
    totalUpkeepPerHour: 2,
    stacks: [{ unit: 'spearman', count: 10 }],
    movement: {
      departedAt: '2026-01-01T00:00:00Z',
      path: [{ q: 0, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 2 }],
      cumulativeHours: [0, 1, 2],
      edgeHours: [0, 0.5, 1.5],
      arrivesAt: '2026-01-01T02:00:00Z',
      returnPath: [],
      returnCumulativeHours: [],
      returnEdgeHours: [],
      // Standing on its destination and not yet turned home (relative to the real clock), so it can still be recalled.
      turnAroundAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      returnArrivesAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
      isReturning: false,
      isStranded: false,
      isFleeing: false,
    },
    starvesAt: null,
    ...overrides,
  };
}

describe('ArmyPanel row double tap', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('emits focus-army with the row\'s army id', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' }), army({ id: 'army-2' })];
    const wrapper = mount(ArmyPanel, {
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
    const rows = wrapper.findAll('[data-testid="army-row-head"]');
    expect(rows).toHaveLength(2);
    await rows[1].trigger('click');
    await rows[1].trigger('click');
    expect(wrapper.emitted('focus-army')).toEqual([['army-2']]);
    expect(world.selectedArmyId).toBe('army-2');
  });
});

describe('ArmyPanel recall refusal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    recallArmy.mockReset();
  });

  /** The detail with Recall opens under the selected row only. */
  const item = (wrapper: ReturnType<typeof mountPanel>, index: number) => wrapper.findAll('[data-testid="army-row"]')[index];

  function mountPanel() {
    return mount(ArmyPanel, {
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
  }

  it('a refused recall (409) shows the translated rejection on the clicked row', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' }), army({ id: 'army-2' })];
    recallArmy.mockRejectedValue(
      new ApiError(409, { title: 'No route home.', detail: 'No route home exists.', status: 409, rejection: 'NoRouteHome' }),
    );

    world.selectArmy('army-1');
    const wrapper = mountPanel();
    await item(wrapper, 0).get('[data-testid="army-recall"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="army-recall-refusal"]').exists()).toBe(true));

    expect(wrapper.findAll('[data-testid="army-recall-refusal"]')).toHaveLength(1);
    expect(item(wrapper, 0).get('[data-testid="army-recall-refusal"]').text()).toBe('No route home from where the army is now.');
  });

  it('drops the refusal once the army has moved on (e.g. the next poll shows it already returning)', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    recallArmy.mockRejectedValue(
      new ApiError(409, { title: 'Nothing to recall.', status: 409, rejection: 'NothingToRecall' }),
    );

    world.selectArmy('army-1');
    const wrapper = mountPanel();
    await wrapper.get('[data-testid="army-recall"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="army-recall-refusal"]').exists()).toBe(true));

    world.armies = [army({ id: 'army-1', movement: { ...army().movement!, isReturning: true } })];
    await vi.waitFor(() => expect(wrapper.find('[data-testid="army-recall-refusal"]').exists()).toBe(false));
  });

  it('keeps a second row pending while the first row\'s recall finishes', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' }), army({ id: 'army-2' })];
    let finishFirst!: () => void;
    recallArmy
      .mockReturnValueOnce(new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockReturnValueOnce(new Promise<void>(() => {}));
    vi.spyOn(world, 'refreshArmies').mockResolvedValue(undefined);

    const wrapper = mountPanel();
    const recallOf = () => wrapper.get('[data-testid="army-recall"]');
    world.selectArmy('army-1');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="army-recall"]').exists()).toBe(true));
    await recallOf().trigger('click');
    world.selectArmy('army-2');
    await vi.waitFor(() => expect(item(wrapper, 1).find('[data-testid="army-recall"]').exists()).toBe(true));
    await recallOf().trigger('click');
    finishFirst();

    world.selectArmy('army-1');
    await vi.waitFor(() => expect(item(wrapper, 0).find('[data-testid="army-recall"]').exists()).toBe(true));
    await vi.waitFor(() => expect(recallOf().attributes('disabled')).toBeUndefined());
    world.selectArmy('army-2');
    await vi.waitFor(() => expect(item(wrapper, 1).find('[data-testid="army-recall"]').exists()).toBe(true));
    expect(recallOf().attributes('disabled')).toBeDefined();
  });

  it('a recall refused without a rejection code (429) shows the generic recall error', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    recallArmy.mockRejectedValue(new ApiError(429, undefined));

    world.selectArmy('army-1');
    const wrapper = mountPanel();
    await wrapper.get('[data-testid="army-recall"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="army-recall-refusal"]').exists()).toBe(true));

    expect(wrapper.get('[data-testid="army-recall-refusal"]').text()).toBe('Recall failed.');
  });
});

describe('ArmyPanel armies without a home', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lists them under a "Without home" heading after the realm\'s own armies, with no Recall but a field order', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'lost', settlementId: null }), army({ id: 'own' })];
    const wrapper = mount(ArmyPanel, {
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });

    // Both detail views are needed to see the buttons: open each army in turn.
    const list = wrapper.find('.army-list');
    const heading = list.find('[data-testid="army-group-without-home"]');
    expect(heading.text()).toBe('Without home');
    const children = list.element.children;
    const rows = wrapper.findAll('[data-testid="army-row"]');
    expect(rows).toHaveLength(2);
    // The own army first, then the heading, then the army without a home.
    expect(Array.from(children).indexOf(rows[0].element)).toBeLessThan(Array.from(children).indexOf(heading.element));
    expect(Array.from(children).indexOf(heading.element)).toBeLessThan(Array.from(children).indexOf(rows[1].element));

    world.selectArmy('lost');
    await nextTick();
    expect(rows[1].find('[data-testid="army-recall"]').exists()).toBe(false);
    expect(rows[1].find('[data-testid="army-field-order"]').exists()).toBe(true);
    world.selectArmy('own');
    await nextTick();
    expect(rows[0].find('[data-testid="army-recall"]').exists()).toBe(true);
  });

  it('shows no heading while every army has a home', () => {
    const world = useWorldStore();
    world.armies = [army()];
    const wrapper = mount(ArmyPanel, {
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });

    expect(wrapper.find('[data-testid="army-group-without-home"]').exists()).toBe(false);
  });
});

describe('ArmyPanel rows', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function mountPanel() {
    return mount(ArmyPanel, {
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
  }

  it('shows every army as a compact row with a time line, and opens only the selected one into its detail', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' }), army({ id: 'army-2' })];
    const wrapper = mountPanel();

    expect(wrapper.findAll('[data-testid="army-row-head"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="army-timeline-bar"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="army-detail"]').exists()).toBe(false);

    await wrapper.findAll('[data-testid="army-row-head"]')[1].trigger('click');

    expect(world.selectedArmyId).toBe('army-2');
    const details = wrapper.findAll('[data-testid="army-detail"]');
    expect(details).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="army-row"]')[1].find('[data-testid="army-detail"]').exists()).toBe(true);
    // The opened army has its full bar with clock times and the food numbers next to the thin one of its row.
    expect(wrapper.findAll('[data-testid="army-timeline-bar"]')).toHaveLength(3);
    // Only what is still ahead sits under the bar (no clock labels, nothing past), and the names have their own line.
    const upcoming = details[0].get('[data-testid="army-upcoming"]').text();
    expect(upcoming).toMatch(/^Turns home \d{2}:\d{2} (AM|PM) · Home \d{2}:\d{2} (AM|PM)$/);
    expect(details[0].get('[data-testid="army-names"]').text()).toBe('10 Spearman');
    expect(details[0].text()).toContain('Spare');
    expect(details[0].text()).toContain('per hour');
  });

  it('"Show on map" focuses the army', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    world.selectArmy('army-1');
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="army-show-on-map"]').trigger('click');

    expect(wrapper.emitted('focus-army')).toEqual([['army-1']]);
  });

  it('starts the field order from the detail', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    world.selectArmy('army-1');
    const start = vi.spyOn(world, 'startFieldOrder').mockImplementation(() => {});
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="army-field-order"]').trigger('click');

    expect(start).toHaveBeenCalledWith('army-1');
  });
});

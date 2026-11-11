// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
      turnAroundAt: '2026-01-01T02:00:00Z',
      returnArrivesAt: '2026-01-01T04:00:00Z',
      isReturning: false,
      isStranded: false,
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
    const rows = wrapper.findAll('.army-row');
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

    const wrapper = mountPanel();
    await wrapper.findAll('.army-row')[0].get('.recall').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.recall-refusal').exists()).toBe(true));

    expect(wrapper.findAll('.recall-refusal')).toHaveLength(1);
    expect(wrapper.findAll('.army-row')[0].get('.recall-refusal').text()).toBe('No route home from where the army is now.');
  });

  it('drops the refusal once the army has moved on (e.g. the next poll shows it already returning)', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    recallArmy.mockRejectedValue(
      new ApiError(409, { title: 'Nothing to recall.', status: 409, rejection: 'NothingToRecall' }),
    );

    const wrapper = mountPanel();
    await wrapper.get('.army-row .recall').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.recall-refusal').exists()).toBe(true));

    world.armies = [army({ id: 'army-1', movement: { ...army().movement!, isReturning: true } })];
    await vi.waitFor(() => expect(wrapper.find('.recall-refusal').exists()).toBe(false));
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
    await wrapper.findAll('.army-row')[0].get('.recall').trigger('click');
    await wrapper.findAll('.army-row')[1].get('.recall').trigger('click');
    finishFirst();

    await vi.waitFor(() =>
      expect(wrapper.findAll('.army-row')[0].get('.recall').attributes('disabled')).toBeUndefined(),
    );
    expect(wrapper.findAll('.army-row')[1].get('.recall').attributes('disabled')).toBeDefined();
  });

  it('a recall refused without a rejection code (429) shows the generic recall error', async () => {
    const world = useWorldStore();
    world.armies = [army({ id: 'army-1' })];
    recallArmy.mockRejectedValue(new ApiError(429, undefined));

    const wrapper = mountPanel();
    await wrapper.get('.army-row .recall').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.recall-refusal').exists()).toBe(true));

    expect(wrapper.get('.recall-refusal').text()).toBe('Recall failed.');
  });
});

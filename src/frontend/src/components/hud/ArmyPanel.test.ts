// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ArmyPanel from './ArmyPanel.vue';
import { useWorldStore } from '../../stores/world';
import type { ArmyResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

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
    },
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

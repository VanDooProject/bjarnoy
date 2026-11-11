// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useWorldStore } from '../stores/world';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import type { ArmyResponse } from '../api/types';
import { sortArmyRowsByEta, useArmyRows, type ArmyRow } from './useArmyRows';

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
      path: [{ q: 0, r: 0 }, { q: 2, r: 2 }],
      cumulativeHours: [0, 2],
      edgeHours: [0, 1],
      arrivesAt: '2026-01-01T02:00:00Z',
      returnPath: [{ q: 2, r: 2 }, { q: 0, r: 0 }],
      returnCumulativeHours: [0, 2],
      returnEdgeHours: [0, 1],
      turnAroundAt: '2026-01-01T02:00:00Z',
      returnArrivesAt: '2026-01-01T04:00:00Z',
      isReturning: false,
    },
    ...overrides,
  };
}

function row(overrides: Partial<ArmyRow> = {}): ArmyRow {
  return {
    id: 'a',
    composition: '10× Spearman',
    status: 'In transit',
    eta: '1h 0m',
    etaMs: Date.parse('2026-01-01T01:00:00Z'),
    progress: 0.5,
    canRecall: true,
    canFieldOrder: true,
    fieldOrderLocked: false,
    fieldOrderLabel: 'Move on',
    selected: false,
    mission: null,
    ...overrides,
  };
}

describe('sortArmyRowsByEta', () => {
  it('sorts soonest ETA first', () => {
    const near = row({ id: 'near', etaMs: 1000 });
    const far = row({ id: 'far', etaMs: 2000 });
    expect(sortArmyRowsByEta([far, near])).toEqual([near, far]);
  });

  it('puts a supporting army (no ETA) last regardless of order', () => {
    const supporting = row({ id: 'supporting', etaMs: null });
    const inTransit = row({ id: 'transit', etaMs: 5000 });
    expect(sortArmyRowsByEta([supporting, inTransit]).map((r) => r.id)).toEqual(['transit', 'supporting']);
  });

  it('breaks ties by id, stably', () => {
    const a = row({ id: 'a', etaMs: 1000 });
    const b = row({ id: 'b', etaMs: 1000 });
    expect(sortArmyRowsByEta([b, a]).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

function mountArmyRows() {
  let rows: ReturnType<typeof useArmyRows> | null = null;
  const Host = defineComponent({
    setup() {
      rows = useArmyRows();
      return () => h('div');
    },
  });
  mount(Host, { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });
  return rows!;
}

describe('useArmyRows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
  });

  it('derives composition, status, ETA and a 0..1 progress fraction for an outbound army', () => {
    const world = useWorldStore();
    world.armies = [army()];

    const rows = mountArmyRows();

    expect(rows.value).toHaveLength(1);
    const r = rows.value[0];
    expect(r.composition).toBe('10× Spearman');
    expect(r.status).toBe('In transit');
    expect(r.eta).toBe('1h 0m');
    expect(r.progress).toBeCloseTo(0.5); // halfway through a 0..2h leg, now at +1h
    expect(r.canRecall).toBe(true);
    expect(r.canFieldOrder).toBe(true); // 'move' mission, not at home/supporting
  });

  it('shows an arrived camp army as building the camp, counting down to arrival plus 10 minutes, and keeps Recall', () => {
    const world = useWorldStore();
    // Arrived at 00:50, now 01:00: the camp is ready at 01:00 (10 minutes after arrival) at world speed 1.
    world.armies = [
      army({
        mission: 'setupcamp',
        stacks: [{ unit: 'campbuilder', count: 2 }],
        movement: { ...army().movement!, arrivesAt: '2026-01-01T00:50:00Z' },
      }),
    ];
    world.worldSpeedFactor = 1;
    vi.setSystemTime(new Date('2026-01-01T00:55:00Z'));

    const r = mountArmyRows().value[0];

    expect(r.status).toMatch(/^Building the camp, ready at \d{2}:\d{2}( [AP]M)?$/);
    expect(r.eta).toBe('5m 0s');
    expect(r.canRecall).toBe(true);
    expect(r.mission).toBe('Set up camp');
  });

  it('scales the camp build time by the world speed', () => {
    const world = useWorldStore();
    world.armies = [army({ mission: 'setupcamp', movement: { ...army().movement!, arrivesAt: '2026-01-01T00:50:00Z' } })];
    world.worldSpeedFactor = 5; // 10 min / 5 = 2 min after arrival
    vi.setSystemTime(new Date('2026-01-01T00:51:00Z'));

    expect(mountArmyRows().value[0].eta).toBe('1m 0s');
  });

  it('still counts a camp army that has not arrived yet down to its arrival', () => {
    const world = useWorldStore();
    world.armies = [army({ mission: 'setupcamp' })];

    const r = mountArmyRows().value[0];

    expect(r.status).toBe('In transit');
    expect(r.eta).toBe('1h 0m');
  });

  it('uses the return leg once an army has turned around', () => {
    const world = useWorldStore();
    world.armies = [
      army({
        movement: {
          departedAt: '2026-01-01T00:00:00Z',
          path: [{ q: 0, r: 0 }, { q: 2, r: 2 }],
          cumulativeHours: [0, 2],
          edgeHours: [0, 1],
          arrivesAt: '2026-01-01T02:00:00Z',
          returnPath: [{ q: 2, r: 2 }, { q: 0, r: 0 }],
          returnCumulativeHours: [0, 2],
          returnEdgeHours: [0, 1],
          turnAroundAt: '2026-01-01T00:00:00Z',
          returnArrivesAt: '2026-01-01T02:00:00Z',
          isReturning: true,
        },
      }),
    ];

    const rows = mountArmyRows();

    const r = rows.value[0];
    expect(r.status).toBe('Returning');
    expect(r.eta).toBe('1h 0m'); // returnArrivesAt, not arrivesAt
    expect(r.progress).toBeCloseTo(0.5);
    expect(r.canRecall).toBe(false); // already turned around
  });

  it('reports no ETA/progress and no recall for a supporting army', () => {
    const world = useWorldStore();
    world.armies = [army({ supporting: true, movement: null, mission: 'support' })];

    const rows = mountArmyRows();

    const r = rows.value[0];
    expect(r.eta).toBeNull();
    expect(r.etaMs).toBeNull();
    expect(r.progress).toBeNull();
    expect(r.canRecall).toBe(true); // supporting armies can still be recalled
    expect(r.canFieldOrder).toBe(false); // canFieldOrderArmy excludes supporting
    expect(r.mission).toBe('Support');
  });
});

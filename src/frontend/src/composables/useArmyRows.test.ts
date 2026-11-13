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
import { groupArmyRowsByHome, sortArmyRowsByEta, useArmyRows, type ArmyRow } from './useArmyRows';

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
      isStranded: false,
      isFleeing: false,
    },
    starvesAt: null,
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
    withoutHome: false,
    ...overrides,
  };
}

describe('groupArmyRowsByHome', () => {
  it('puts the armies without a home under their own heading, after the realm\'s own armies, keeping the order', () => {
    const own = row({ id: 'own' });
    const lostA = row({ id: 'lost-a', withoutHome: true });
    const lostB = row({ id: 'lost-b', withoutHome: true });

    const groups = groupArmyRowsByHome([lostA, own, lostB], 'Without home');

    expect(groups.map((g) => [g.key, g.heading, g.rows.map((r) => r.id)])).toEqual([
      ['home', null, ['own']],
      ['withoutHome', 'Without home', ['lost-a', 'lost-b']],
    ]);
  });

  it('leaves out an empty group, so no heading shows without armies under it', () => {
    expect(groupArmyRowsByHome([row({ id: 'own' })], 'Without home').map((g) => g.key)).toEqual(['home']);
    expect(groupArmyRowsByHome([row({ id: 'lost', withoutHome: true })], 'Without home').map((g) => g.key)).toEqual(['withoutHome']);
    expect(groupArmyRowsByHome([], 'Without home')).toEqual([]);
  });
});

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

  it('shows an army that cannot get home with the time until it starves, no recall, and a move-on order', () => {
    const world = useWorldStore();
    const stand = { q: 2, r: 2 };
    world.armies = [
      army({
        position: stand,
        movement: {
          departedAt: '2026-01-01T00:00:00Z',
          path: [stand],
          cumulativeHours: [0],
          edgeHours: [0],
          arrivesAt: '2026-01-01T00:00:00Z',
          returnPath: [stand],
          returnCumulativeHours: [0],
          returnEdgeHours: [0],
          turnAroundAt: '2026-01-01T04:30:00Z',
          returnArrivesAt: '2026-01-01T04:30:00Z',
          isReturning: false,
          isStranded: true,
          isFleeing: false,
        },
        starvesAt: '2026-01-01T04:30:00Z',
      }),
    ];

    const rows = mountArmyRows();

    const r = rows.value[0];
    expect(r.status).toBe('Cannot get home');
    expect(r.eta).toBe('starves in 3h 30m');
    expect(r.etaMs).toBe(Date.parse('2026-01-01T04:30:00Z'));
    expect(r.canRecall).toBe(false);
    expect(r.canFieldOrder).toBe(true);
    expect(r.fieldOrderLabel).toBe('Move on');
  });

  it('marks an army without a home: no recall, but it still takes a field order', () => {
    const world = useWorldStore();
    world.armies = [army({ settlementId: null, starvesAt: '2026-01-01T04:30:00Z' })];

    const r = mountArmyRows().value[0];

    expect(r.withoutHome).toBe(true);
    expect(r.canRecall).toBe(false);
    expect(r.canFieldOrder).toBe(true);
    expect(r.eta).toBe('starves in 3h 30m');
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

  it('shows an army that has arrived as standing, counting down to when it heads home', () => {
    const world = useWorldStore();
    const base = army();
    world.armies = [
      army({
        position: { q: 2, r: 2 },
        movement: { ...base.movement!, arrivesAt: '2026-01-01T00:30:00Z', turnAroundAt: '2026-01-01T03:00:00Z' },
      }),
    ];

    const r = mountArmyRows().value[0];

    expect(r.status).toBe('Standing at (2, 2)');
    expect(r.eta).toBe('heads home in 2h 0m');
    expect(r.etaMs).toBe(Date.parse('2026-01-01T03:00:00Z'));
  });

  describe('a group of a gathering army', () => {
    const group = (moveFields: Partial<ArmyResponse['movement'] & object>, gatherDepartsAt = '2026-01-01T03:00:00Z') =>
      army({
        position: { q: 2, r: 2 },
        gatheringId: 'g1',
        gatherHex: { q: 2, r: 2 },
        gatherDepartsAt,
        movement: { ...army().movement!, ...moveFields },
      });

    it('waits at the meeting hex, counting down to when the gathering moves on, and can be recalled', () => {
      const world = useWorldStore();
      world.armies = [group({ arrivesAt: '2026-01-01T00:30:00Z', turnAroundAt: '2026-01-01T06:00:00Z' })];

      const r = mountArmyRows().value[0];

      expect(r.status).toBe('Waiting at (2, 2) for the other groups');
      expect(r.eta).toBe('moves on in 2h 0m');
      expect(r.etaMs).toBe(Date.parse('2026-01-01T03:00:00Z'));
      expect(r.canRecall).toBe(true);
    });

    it('keeps waiting past its own turn-around instead of reading as returning', () => {
      const world = useWorldStore();
      world.armies = [group({ arrivesAt: '2026-01-01T00:20:00Z', turnAroundAt: '2026-01-01T00:40:00Z' })];

      const r = mountArmyRows().value[0];

      expect(r.status).toBe('Waiting at (2, 2) for the other groups');
      expect(r.eta).toBe('moves on in 2h 0m');
      expect(r.canRecall).toBe(true);
    });

    it('follows the normal rules once the gathering has left', () => {
      const world = useWorldStore();
      world.armies = [
        group({ arrivesAt: '2026-01-01T00:20:00Z', turnAroundAt: '2026-01-01T03:00:00Z' }, '2026-01-01T00:30:00Z'),
      ];

      const r = mountArmyRows().value[0];

      expect(r.status).toBe('Standing at (2, 2)');
      expect(r.eta).toBe('heads home in 2h 0m');
    });

    it('is in transit while still marching to the meeting hex', () => {
      const world = useWorldStore();
      world.armies = [group({ arrivesAt: '2026-01-01T02:00:00Z', turnAroundAt: '2026-01-01T06:00:00Z' })];

      const r = mountArmyRows().value[0];

      expect(r.status).toBe('In transit');
      expect(r.eta).toBe('1h 0m');
      expect(r.etaMs).toBe(Date.parse('2026-01-01T02:00:00Z'));
    });
  });

  it('counts an army past its turn-around down to its return home before the next refresh reports it returning', () => {
    const world = useWorldStore();
    const base = army();
    world.armies = [
      army({
        movement: {
          ...base.movement!,
          arrivesAt: '2026-01-01T00:20:00Z',
          turnAroundAt: '2026-01-01T00:40:00Z',
          returnArrivesAt: '2026-01-01T01:30:00Z',
        },
      }),
    ];

    const r = mountArmyRows().value[0];

    expect(r.status).toBe('Returning');
    expect(r.eta).toBe('30m 0s');
    expect(r.etaMs).toBe(Date.parse('2026-01-01T01:30:00Z'));
    expect(r.canRecall).toBe(false);
  });

  it('keeps counting a marching army down to its arrival', () => {
    const world = useWorldStore();
    world.armies = [army()];

    const r = mountArmyRows().value[0];

    expect(r.status).toBe('In transit');
    expect(r.eta).toBe('1h 0m');
    expect(r.etaMs).toBe(Date.parse('2026-01-01T02:00:00Z'));
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
          isStranded: false,
          isFleeing: false,
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

  it('offers a free "Move on" (no recall) to an army fleeing home after a lost field battle, whatever its mission', () => {
    const world = useWorldStore();
    const base = army();
    world.armies = [
      army({
        mission: 'attack',
        movement: { ...base.movement!, turnAroundAt: '2026-01-01T00:00:00Z', isReturning: true, isFleeing: true },
      }),
    ];

    const rows = mountArmyRows();

    const r = rows.value[0];
    expect(r.canFieldOrder).toBe(true);
    expect(r.fieldOrderLocked).toBe(false);
    expect(r.fieldOrderLabel).toBe('Move on');
    expect(r.canRecall).toBe(false); // already walking home
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

import { describe, expect, it } from 'vitest';
import type { ArmyResponse } from '../../api/types';
import { armyTimelineState, buildArmyTimeline } from './armyTimeline';

const H = 3600 * 1000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (hours: number) => new Date(T0 + hours * H).toISOString();

/** Leaves at 0h, arrives at 2h, turns home at 8h, is home at 10h: a 10h trip with 2h of march, 6h spare and 2h home. */
function army(overrides: Partial<ArmyResponse> = {}): ArmyResponse {
  return {
    id: 'a',
    settlementId: 's',
    mission: 'move',
    targetSettlementId: null,
    atHome: false,
    supporting: false,
    position: { q: 3, r: 4 },
    provisions: 412,
    totalSpeed: 4,
    visionRadius: 2,
    totalUpkeepPerHour: 56,
    stacks: [{ unit: 'karve', count: 4 }],
    movement: {
      departedAt: at(0),
      path: [{ q: 0, r: 0 }, { q: 3, r: 4 }],
      cumulativeHours: [0, 2],
      edgeHours: [0, 1],
      arrivesAt: at(2),
      returnPath: [{ q: 3, r: 4 }, { q: 0, r: 0 }],
      returnCumulativeHours: [0, 2],
      returnEdgeHours: [0, 1],
      turnAroundAt: at(8),
      returnArrivesAt: at(10),
      isReturning: false,
      isStranded: false,
      isFleeing: false,
    },
    starvesAt: null,
    ...overrides,
  };
}

const kinds = (a: ArmyResponse, hours: number, campReadyAt: number | null = null) =>
  buildArmyTimeline(a, T0 + hours * H, campReadyAt)!;

describe('buildArmyTimeline', () => {
  it('marching: march, spare and way home, the now tick on the march', () => {
    const t = kinds(army(), 1);
    expect(t.state).toBe('marching');
    expect(t.sections.map((s) => [s.kind, s.fraction])).toEqual([
      ['march', 0.2],
      ['spare', 0.6],
      ['wayHome', 0.2],
    ]);
    expect(t.nowFraction).toBeCloseTo(0.1);
    expect(t.startsAt).toBe(at(0));
    expect(t.endsAt).toBe(at(10));
    expect(t.endMark).toBe(false);
    expect(t.events.map((e) => [e.kind, e.past])).toEqual([
      ['left', true],
      ['now', true],
      ['arrived', false],
      ['turnsHome', false],
      ['home', false],
    ]);
    expect(t.events.find((e) => e.kind === 'arrived')!.hex).toEqual({ q: 3, r: 4 });
  });

  it('standing: the now tick on the spare leg, spare time left and the way home as food numbers', () => {
    const t = kinds(army(), 5);
    expect(t.state).toBe('standing');
    expect(t.nowFraction).toBeCloseTo(0.5);
    expect(t.events.map((e) => e.kind)).toEqual(['left', 'arrived', 'now', 'turnsHome', 'home']);
    expect(t.food).toEqual({ provisions: 412, perHour: 56, spareMs: 3 * H, wayHomeMs: 2 * H });
  });

  it('returning: the now tick on the way home, no spare time left', () => {
    const t = kinds(army({ movement: { ...army().movement!, isReturning: true } }), 9);
    expect(t.state).toBe('returning');
    expect(t.nowFraction).toBeCloseTo(0.9);
    expect(t.events.map((e) => [e.kind, e.past])).toEqual([
      ['left', true],
      ['arrived', true],
      ['turnsHome', true],
      ['now', true],
      ['home', false],
    ]);
    expect(t.food.spareMs).toBeNull();
    expect(t.food.wayHomeMs).toBe(2 * H);
  });

  it('stranded: march, then red up to the moment the food runs out, closed by an end mark', () => {
    const stranded = army({
      starvesAt: at(6),
      movement: { ...army().movement!, isStranded: true },
    });
    const t = kinds(stranded, 4);
    expect(t.state).toBe('stranded');
    expect(t.sections.map((s) => [s.kind, s.fraction])).toEqual([
      ['march', 1 / 3],
      ['starving', 2 / 3],
    ]);
    expect(t.endsAt).toBe(at(6));
    expect(t.endMark).toBe(true);
    expect(t.nowFraction).toBeCloseTo(2 / 3);
    expect(t.events.map((e) => e.kind)).toEqual(['left', 'arrived', 'now', 'starves']);
    expect(t.food.spareMs).toBeNull();
    expect(t.food.wayHomeMs).toBeNull();
  });

  it('supporting: a bar without times and without an end, no events', () => {
    const t = buildArmyTimeline(army({ supporting: true, movement: null }), T0, null)!;
    expect(t.state).toBe('supporting');
    expect(t.sections).toEqual([{ kind: 'supporting', fraction: 1, startsAt: null }]);
    expect(t.endsAt).toBeNull();
    expect(t.nowFraction).toBeNull();
    expect(t.events).toEqual([]);
  });

  it('waiting to gather: march, then a waiting section up to the departure of the gathering', () => {
    const waiting = army({ gatheringId: 'g', gatherDepartsAt: at(4) });
    const t = kinds(waiting, 3);
    expect(t.state).toBe('waiting');
    expect(t.sections.map((s) => [s.kind, s.fraction])).toEqual([
      ['march', 0.5],
      ['waiting', 0.5],
    ]);
    expect(t.nowFraction).toBeCloseTo(0.75);
    expect(t.events.map((e) => e.kind)).toEqual(['left', 'arrived', 'now', 'movesOn']);
    expect(t.endMark).toBe(false);
  });

  it('building the camp: march, then gold up to the camp being ready', () => {
    const camp = army({ mission: 'setupcamp' });
    const t = kinds(camp, 3, T0 + 6 * H);
    expect(t.state).toBe('camp');
    expect(t.sections.map((s) => [s.kind, s.fraction])).toEqual([
      ['march', 1 / 3],
      ['camp', 2 / 3],
    ]);
    expect(t.nowFraction).toBeCloseTo(0.5);
    expect(t.events.map((e) => e.kind)).toEqual(['left', 'arrived', 'now', 'campReady']);
  });

  it('clamps the now tick onto the bar and drops a leg of no length', () => {
    const noSpare = army({ movement: { ...army().movement!, turnAroundAt: at(2) } });
    const t = kinds(noSpare, 20);
    expect(t.sections.map((s) => s.kind)).toEqual(['march', 'wayHome']);
    expect(t.nowFraction).toBe(1);
  });

  it('has no time line for an army at home, without a trip or with a trip of no length', () => {
    expect(buildArmyTimeline(army({ atHome: true, movement: null }), T0, null)).toBeNull();
    expect(buildArmyTimeline(army({ movement: null }), T0, null)).toBeNull();
    const instant = army({
      movement: { ...army().movement!, arrivesAt: at(0), turnAroundAt: at(0), returnArrivesAt: at(0) },
    });
    expect(buildArmyTimeline(instant, T0, null)).toBeNull();
  });
});

describe('armyTimelineState', () => {
  it('a hunt army never stands: it fights on arrival, so until it turns home it counts as marching', () => {
    expect(armyTimelineState(army({ mission: 'hunt' }), T0 + 5 * H, null)).toBe('marching');
  });
});

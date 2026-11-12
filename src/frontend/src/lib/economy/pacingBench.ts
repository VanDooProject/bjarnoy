import type { BuildingDefinitionResponse } from '../../api/types';
import { PROFILE_PRESETS, settlerCostFrom, simulatePacing, type Session } from './pacingSim';
import { applyWhatIf, defaultWhatIf, type WhatIfKnobs } from './whatIf';

// The Pacing Bench: the knob-driven catalogue (`applyWhatIf`) run through the pacing simulator
// (`simulatePacing`) for four fixed player profiles. Pure, so the Web Worker and the tests share it.

export interface BenchProfile {
  id: 'activeFeasts' | 'active' | 'checkins4' | 'checkins2';
  label: string;
  sessions: Session[];
  feasts: boolean;
  /** Design target for the 2nd settlement (docs/design/economy.md §9), shown next to the result; null when none is set. */
  secondSettlementTarget: string | null;
}

export const BENCH_PROFILES: readonly BenchProfile[] = [
  { id: 'activeFeasts', label: 'Active, feasts', sessions: PROFILE_PRESETS.active, feasts: true, secondSettlementTarget: '≈ 5–6.5' },
  { id: 'active', label: 'Active, no feasts', sessions: PROFILE_PRESETS.active, feasts: false, secondSettlementTarget: '≈ 12–14' },
  { id: 'checkins4', label: '4 check-ins, feasts', sessions: PROFILE_PRESETS.checkins4, feasts: true, secondSettlementTarget: '≈ 13–15' },
  { id: 'checkins2', label: '2 check-ins, feasts', sessions: PROFILE_PRESETS.checkins2, feasts: true, secondSettlementTarget: null },
];

/** The producers the player starts with (one count each) and the types whose level-1 output is a knob. */
export const BENCH_START_TYPES = ['lumberjack', 'claybrickworks', 'reindeerherder', 'farm', 'fishinghut', 'bogoreworks'] as const;
export const BENCH_OUTPUT_TYPES = ['lumberjack', 'claybrickworks', 'reindeerherder', 'farm', 'pumpkinfarm', 'fishinghut', 'bogoreworks'] as const;
const DEFAULT_START_COUNTS: Record<string, number> = { lumberjack: 3, claybrickworks: 3, reindeerherder: 3, farm: 0, fishinghut: 0, bogoreworks: 2 };

/** Longhouse levels listed in the milestone table. */
export const BENCH_LH_MILESTONES = [5, 10, 15, 20, 25, 30] as const;
/** Longhouse levels whose wood cost is listed. */
export const BENCH_LH_COST_LEVELS = [5, 10, 11, 15, 20, 25, 28, 30] as const;
/** One chart sample every this many hours (the simulator samples hourly). */
export const BENCH_SAMPLE_HOURS = 6;

/** Every what-if knob plus the settings of the simulated run. */
export interface BenchKnobs extends WhatIfKnobs {
  producersPerTower: number;
  /** Starting producers per type. */
  startCounts: Record<string, number>;
  producersAhead: number;
  renownThreshold: number;
  horizonDays: number;
}

/** The knobs at the live catalogue's values: running them reproduces the live catalogue. */
export function benchDefaults(live: Record<string, BuildingDefinitionResponse[]>): BenchKnobs {
  const levelOneOutput: Record<string, number> = {};
  for (const type of BENCH_OUTPUT_TYPES) {
    const p = live[type]?.find((d) => d.level === 1)?.productionPerHour;
    if (p) levelOneOutput[type] = p.wood + p.stone + p.food + p.iron;
  }
  return {
    ...defaultWhatIf(),
    levelOneOutput,
    producersPerTower: 1,
    startCounts: { ...DEFAULT_START_COUNTS },
    producersAhead: 3,
    renownThreshold: 80_000,
    horizonDays: 200,
  };
}

export interface BenchProfileResult {
  id: BenchProfile['id'];
  /** Minute a Longhouse level finished, per level. */
  lhReachedAt: Record<number, number>;
  secondSettlementAt: number | null;
  /** Longhouse level every `BENCH_SAMPLE_HOURS` hours. */
  lh: number[];
  /** Wood + brick + food per hour, the same samples. */
  prod: number[];
}

export interface BenchResult {
  profiles: BenchProfileResult[];
  /** Wood cost of Longhouse level 1, 2, ... */
  lhWoodCost: number[];
}

export function runBench(live: Record<string, BuildingDefinitionResponse[]>, knobs: BenchKnobs): BenchResult {
  const byType = applyWhatIf(live, knobs);
  const profiles = BENCH_PROFILES.map((p): BenchProfileResult => {
    const r = simulatePacing(byType, {
      startStock: knobs.foundingStock,
      horizonDays: Math.max(1, knobs.horizonDays),
      producerCounts: knobs.startCounts,
      settlerCost: settlerCostFrom(undefined),
      settleType: 'cartworkshop',
      producersAhead: knobs.producersAhead,
      sessions: p.sessions,
      feasts: p.feasts,
      renownThreshold: knobs.renownThreshold,
      producersPerTower: knobs.producersPerTower,
    });
    const lh: number[] = [];
    const prod: number[] = [];
    for (let i = 0; i < r.series.minute.length; i += BENCH_SAMPLE_HOURS) {
      lh.push(r.series.lh[i]);
      prod.push(Math.round(r.series.rate.wood[i] + r.series.rate.stone[i] + r.series.rate.food[i]));
    }
    return { id: p.id, lhReachedAt: r.lhReachedAt, secondSettlementAt: r.secondSettlementAt, lh, prod };
  });
  return { profiles, lhWoodCost: (byType.longhouse ?? []).map((d) => d.cost.wood) };
}

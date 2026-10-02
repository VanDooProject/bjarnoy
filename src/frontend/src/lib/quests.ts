// Onboarding quests (docs/design/economy.md section 7), demo-mode side.
//
// In live mode the backend is the source of truth: `SettlementResponse.quests`
// says what is completed/claimed and `POST /settlements/{id}/quests/{id}/claim`
// pays. Demo mode has no backend but does keep a local stock on `WorldModel`,
// so it evaluates the same eight quests here and pays them locally. Keep this
// list in step with `Bjarnoy.Domain.Settlers.Quests`.
import type { QuestResponse, ResourceLine } from '../api/types';
import type { Resources } from './map/types';

interface QuestDef {
  id: string;
  reward: ResourceLine;
  /** Whether a settlement at `level` with these standing building counts meets the quest. */
  done: (state: DemoQuestState) => boolean;
}

export interface DemoQuestState {
  /** Longhouse level. */
  level: number;
  /** Standing buildings by wire name (`farm`, `storagehouse`, ...). */
  counts: Readonly<Record<string, number>>;
  /** Whether a hunt was ever sent. Demo mode has no armies, so this stays false there. */
  huntStarted?: boolean;
  /** Fighting land units at home. Demo mode has no garrison, so this stays 0 there. */
  fightingLandUnits?: number;
}

/** Resource producers for the "n producers built" quests (wire names). */
export const PRODUCER_TYPES: ReadonlySet<string> = new Set([
  'lumberjack',
  'quarry',
  'claybrickworks',
  'reindeerherder',
  'bogoreworks',
  'farm',
  'pumpkinfarm',
  'fishinghut',
]);

function producers(state: DemoQuestState): number {
  let n = 0;
  for (const [type, count] of Object.entries(state.counts)) {
    if (PRODUCER_TYPES.has(type)) n += count;
  }
  return n;
}

/** The quests in presentation order; a quest's index is its bit in the claimed mask. */
export const QUESTS: readonly QuestDef[] = [
  { id: 'producers3', reward: { wood: 150, stone: 120, food: 80, iron: 0 }, done: (s) => producers(s) >= 3 },
  { id: 'longhouse2', reward: { wood: 250, stone: 200, food: 150, iron: 0 }, done: (s) => s.level >= 2 },
  { id: 'storagehouse1', reward: { wood: 200, stone: 200, food: 200, iron: 0 }, done: (s) => (s.counts.storagehouse ?? 0) >= 1 },
  { id: 'producers6', reward: { wood: 200, stone: 150, food: 100, iron: 0 }, done: (s) => producers(s) >= 6 },
  { id: 'longhouse3', reward: { wood: 400, stone: 300, food: 200, iron: 0 }, done: (s) => s.level >= 3 },
  { id: 'longhouse5', reward: { wood: 800, stone: 600, food: 400, iron: 0 }, done: (s) => s.level >= 5 },
  { id: 'spearmen5', reward: { wood: 500, stone: 400, food: 300, iron: 0 }, done: (s) => (s.fightingLandUnits ?? 0) >= 5 },
  // The server only records a hunt once spearmen5 is claimed; demo mode never sets huntStarted.
  { id: 'hunt1', reward: { wood: 400, stone: 300, food: 300, iron: 0 }, done: (s) => s.huntStarted === true },
];

/** Demo mode: the quest list as the server would report it. */
export function evaluateDemoQuests(state: DemoQuestState, claimedMask: number): QuestResponse[] {
  return QUESTS.map((q, bit) => ({
    id: q.id,
    completed: q.done(state),
    claimed: (claimedMask & (1 << bit)) !== 0,
    reward: { ...q.reward },
  }));
}

/** The bit of `questId` in the claimed mask, or -1 for an unknown quest. */
export function questBit(questId: string): number {
  return QUESTS.findIndex((q) => q.id === questId);
}

/** Whether paying `reward` on top of `stock` would push wood, stone or food past `capacity`. */
export function rewardOverflows(reward: ResourceLine, stock: Resources, capacity: Resources): boolean {
  return (['wood', 'stone', 'food'] as const).some((k) => stock[k] + reward[k] > capacity[k]);
}

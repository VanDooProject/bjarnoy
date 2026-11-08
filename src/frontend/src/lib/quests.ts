// Onboarding quests (docs/design/economy.md section 7), demo-mode side.
//
// In live mode the backend is the source of truth: `SettlementResponse.quests`
// says what is completed/claimed and `POST /settlements/{id}/quests/{id}/claim`
// pays. Demo mode has no backend but does keep a local stock on `WorldModel`,
// so it evaluates the same quests here and pays them locally. Keep this
// list in step with `Bjarnoy.Domain.Settlers.Quests`.
import type { QuestResponse, ResourceLine } from '../api/types';
import type { Resources } from './map/types';

interface QuestDef {
  id: string;
  /** The quest's bit in the claimed mask — never renumber (matches `Quest.Bit` in the backend). */
  bit: number;
  reward: ResourceLine;
  /** Whether a settlement at `level` with these standing building counts meets the quest. */
  done: (state: DemoQuestState) => boolean;
  /** Counted progress toward the goal; absent for a quest without one. */
  progress?: (state: DemoQuestState) => { current: number; target: number };
}

export interface DemoQuestState {
  /** Longhouse level. */
  level: number;
  /** Standing buildings by wire name (`farm`, `storagehouse`, ...). */
  counts: Readonly<Record<string, number>>;
  /** Whether a hunt was ever sent. Demo mode has no armies, so this stays false there. */
  huntStarted?: boolean;
  /** Whether the garrison ever held 5 fighting land units (latched server-side). Demo mode has no garrison, so this stays false there. */
  troopsTrained?: boolean;
  /** Level of the highest standing Tower (0 or absent when there is none). */
  towerLevel?: number;
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

/** Clamps `current` to `target` (not below 0), like the server. */
function progress(current: number, target: number): { current: number; target: number } {
  return { current: Math.min(current, target), target };
}

/** The quests in presentation order; each carries its own bit in the claimed mask. */
export const QUESTS: readonly QuestDef[] = [
  { id: 'producers3', bit: 0, reward: { wood: 150, stone: 120, food: 80, iron: 0 }, done: (s) => producers(s) >= 3, progress: (s) => progress(producers(s), 3) },
  { id: 'longhouse2', bit: 1, reward: { wood: 250, stone: 200, food: 150, iron: 0 }, done: (s) => s.level >= 2, progress: (s) => progress(s.level, 2) },
  { id: 'storagehouse1', bit: 2, reward: { wood: 200, stone: 200, food: 200, iron: 0 }, done: (s) => (s.counts.storagehouse ?? 0) >= 1 },
  { id: 'producers6', bit: 3, reward: { wood: 200, stone: 150, food: 100, iron: 0 }, done: (s) => producers(s) >= 6, progress: (s) => progress(producers(s), 6) },
  { id: 'longhouse3', bit: 4, reward: { wood: 400, stone: 300, food: 200, iron: 0 }, done: (s) => s.level >= 3, progress: (s) => progress(s.level, 3) },
  { id: 'tower3', bit: 8, reward: { wood: 400, stone: 300, food: 200, iron: 0 }, done: (s) => (s.towerLevel ?? 0) >= 3, progress: (s) => progress(s.towerLevel ?? 0, 3) },
  { id: 'longhouse5', bit: 5, reward: { wood: 800, stone: 600, food: 400, iron: 0 }, done: (s) => s.level >= 5, progress: (s) => progress(s.level, 5) },
  {
    id: 'spearmen5',
    bit: 6,
    reward: { wood: 500, stone: 400, food: 300, iron: 0 },
    done: (s) => s.troopsTrained === true || (s.fightingLandUnits ?? 0) >= 5,
    progress: (s) => (s.troopsTrained === true ? { current: 5, target: 5 } : progress(s.fightingLandUnits ?? 0, 5)),
  },
  // Needs the trained-troops latch and a started hunt; no claim involved. Demo mode never sets either.
  { id: 'hunt1', bit: 7, reward: { wood: 400, stone: 300, food: 300, iron: 0 }, done: (s) => s.troopsTrained === true && s.huntStarted === true },
];

/** Demo mode: the quest list as the server would report it. */
export function evaluateDemoQuests(state: DemoQuestState, claimedMask: number): QuestResponse[] {
  return QUESTS.map((q) => ({
    id: q.id,
    completed: q.done(state),
    claimed: (claimedMask & (1 << q.bit)) !== 0,
    reward: { ...q.reward },
    progress: q.progress ? q.progress(state) : null,
  }));
}

/** The bit of `questId` in the claimed mask, or -1 for an unknown quest. */
export function questBit(questId: string): number {
  return QUESTS.find((q) => q.id === questId)?.bit ?? -1;
}

/** Whether paying `reward` on top of `stock` would push wood, stone or food past `capacity`. */
export function rewardOverflows(reward: ResourceLine, stock: Resources, capacity: Resources): boolean {
  return (['wood', 'stone', 'food'] as const).some((k) => stock[k] + reward[k] > capacity[k]);
}

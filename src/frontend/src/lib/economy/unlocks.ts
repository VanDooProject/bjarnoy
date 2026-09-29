import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse } from '../../api/types';

export interface UnlockEntry {
  type: string;
  prerequisites: BuildingPrerequisiteResponse[];
}

export interface UnlockLevel {
  /** Longhouse level. */
  level: number;
  unlocks: UnlockEntry[];
  /** More than BULK_THRESHOLD unlocks at this single level. */
  bulk: boolean;
  /** Part of a run of at least GAP_RUN consecutive Longhouse levels with no unlock. */
  gap: boolean;
}

export const BULK_THRESHOLD = 2;
export const GAP_RUN = 3;

/**
 * Which building types become placeable at each Longhouse level, judged by
 * the level-1 definition's `requiredLonghouseLevel`. The design goal is
 * roughly one new building per Longhouse level.
 */
export function unlockLadder(byType: Record<string, BuildingDefinitionResponse[]>): UnlockLevel[] {
  const longhouse = byType['longhouse'] ?? [];
  let maxLevel = longhouse.reduce((max, def) => Math.max(max, def.level), 0);

  const atLevel = new Map<number, UnlockEntry[]>();
  for (const type of Object.keys(byType).sort()) {
    const first = byType[type].find((def) => def.level === 1);
    if (!first) continue;
    const req = first.requiredLonghouseLevel;
    maxLevel = Math.max(maxLevel, req);
    const list = atLevel.get(req) ?? [];
    list.push({ type, prerequisites: first.prerequisites.map((p) => ({ ...p })) });
    atLevel.set(req, list);
  }

  const ladder: UnlockLevel[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    const unlocks = atLevel.get(level) ?? [];
    ladder.push({ level, unlocks, bulk: unlocks.length > BULK_THRESHOLD, gap: false });
  }

  let runStart = -1;
  for (let i = 0; i <= ladder.length; i++) {
    const empty = i < ladder.length && ladder[i].unlocks.length === 0;
    if (empty && runStart < 0) runStart = i;
    if (!empty && runStart >= 0) {
      if (i - runStart >= GAP_RUN) for (let j = runStart; j < i; j++) ladder[j].gap = true;
      runStart = -1;
    }
  }
  return ladder;
}

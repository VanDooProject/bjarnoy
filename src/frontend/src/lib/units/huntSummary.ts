// What the hunt dispatch panels show about the targeted wildlife camp: its live garrison, status,
// estimated loot and how the selected army's attack stacks up against the camp's defense. Pure so
// ArmyPanel and MobileDispatchSheet share it (via `HuntTargetSummary.vue`) and it is unit-testable.
// The numbers are an estimate: the server fights the battle (terrain, bonuses, regrowth up to the
// arrival instant), so this only guides the player.
import type { BeastCounts, ResourceLine, UnitDefinitionResponse } from '../../api/types';
import { isStrongCampFamily } from '../map/campPlacement';
import { BEAST_TIERS, defensePower, estimatedLoot, fullGarrison, type BeastTier } from '../map/campRules';
import type { Tile } from '../map/types';

export type CampStatus = 'empty' | 'calm' | 'aggressive' | 'guarded';

export interface HuntSummary {
  family: string;
  effectiveLevel: number;
  strong: boolean;
  status: CampStatus;
  calmUntil: string | null;
  tiers: { tier: BeastTier; count: number; full: number }[];
  /** Σ garrison × beast defense right now. */
  campDefense: number;
  /** Estimated loot before the army's carry cap. */
  loot: ResourceLine;
}

type Camp = NonNullable<Tile['camp']>;

/** The camp summary for the hunt target — a camp without live state counts as pristine (full garrison, aggressive-capable). */
export function huntSummaryFor(camp: Camp, now: number): HuntSummary {
  const strength = isStrongCampFamily(camp.family) ? 'strong' : 'weak';
  const level = camp.effectiveLevel ?? camp.level;
  const full: BeastCounts = camp.fullGarrison ?? fullGarrison(level, strength);
  const garrison: BeastCounts = camp.garrison ?? full;
  const calm = camp.calmUntil ? Date.parse(camp.calmUntil) > now : false;
  const status: CampStatus = camp.empty
    ? 'empty'
    : calm
      ? 'calm'
      : camp.strong && camp.aggressive !== false
        ? 'aggressive'
        : 'guarded';
  return {
    family: camp.family,
    effectiveLevel: level,
    strong: camp.strong,
    status,
    calmUntil: calm ? (camp.calmUntil ?? null) : null,
    tiers: BEAST_TIERS.map((tier) => ({ tier, count: garrison[tier], full: full[tier] })),
    campDefense: defensePower(garrison, strength),
    loot: estimatedLoot(
      camp.family,
      level,
      garrison,
      full,
      camp.leftover ?? { wood: 0, stone: 0, food: 0, iron: 0 },
    ),
  };
}

/** Σ count × attack of the selected units (the hunt battle uses plain army attack vs beast defense). */
export function armyAttackPower(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): number {
  let total = 0;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count > 0) total += count * (byType[type]?.attack ?? 0);
  }
  return total;
}

export type HuntOutlook = 'noArmy' | 'empty' | 'win' | 'lose';

/** A tie goes to the camp, like the server's resolver; an empty camp is a free loot pickup. */
export function huntOutlook(attack: number, summary: HuntSummary): HuntOutlook {
  if (summary.status === 'empty') return 'empty';
  if (attack <= 0) return 'noArmy';
  return attack > summary.campDefense ? 'win' : 'lose';
}

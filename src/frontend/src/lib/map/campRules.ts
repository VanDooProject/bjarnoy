// Wildlife camp gameplay numbers the client shows — a mirror of the backend's `CampRules`
// (see `docs/design/wildlife-camps.md`, section Gameplay). Pure; the server stays authoritative,
// these only feed the docs page, the tooltip fallback and the hunt panel's loot estimate.
import { hexDistance } from '../hex/coords';
import { isEndgameCampFamily, isStrongCampFamily, isWaterCampFamily, type CampStrength } from './campPlacement';
import type { BeastCounts, BeastTier, ResourceLine } from '../../api/types';

export type { BeastTier };
export const BEAST_TIERS: readonly BeastTier[] = ['young', 'adult', 'alpha'];

/** A beast tier's attack / defense — the stats depend on the camp's strength, except Naglfar's crew (`beastStats`). */
export interface BeastStats {
  attack: number;
  defense: number;
}

const BEAST_STATS: Record<CampStrength, Record<BeastTier, BeastStats>> = {
  weak: {
    young: { attack: 0, defense: 2 },
    adult: { attack: 8, defense: 12 },
    alpha: { attack: 15, defense: 25 },
  },
  strong: {
    young: { attack: 2, defense: 5 },
    adult: { attack: 25, defense: 30 },
    alpha: { attack: 50, defense: 60 },
  },
};

/** Naglfar's crew: no young, 100 rime ships (adult), the Naglfar itself (alpha) — mirrors `CampRules.BeastStats` for the family. */
const NAGLFAR_BEAST_STATS: Record<BeastTier, BeastStats> = {
  young: { attack: 0, defense: 0 },
  adult: { attack: 300, defense: 300 },
  alpha: { attack: 30000, defense: 30000 },
};

/** A tier's attack / defense for a camp family — mirrors `CampRules.BeastStats`. */
export function beastStats(family: string, tier: BeastTier): BeastStats {
  if (family === 'naglfar') return NAGLFAR_BEAST_STATS[tier];
  return BEAST_STATS[strengthOf(family)][tier];
}

function strengthOf(family: string): CampStrength {
  return isStrongCampFamily(family) ? 'strong' : 'weak';
}

/** Naglfar's fixed crew — mirrors `CampGarrison.Full` for the family: whatever the level or clears. */
const NAGLFAR_FULL_GARRISON: BeastCounts = { young: 0, adult: 100, alpha: 1 };

/** The pristine garrison of `family` at effective level `level` — mirrors `CampRules.FullGarrison`. */
export function fullGarrison(family: string, level: number): BeastCounts {
  if (family === 'naglfar') return { ...NAGLFAR_FULL_GARRISON };
  return strengthOf(family) === 'strong'
    ? { young: 2 + level, adult: 3 + 3 * level, alpha: level - 1 }
    : { young: 2 + level, adult: 3 + 2 * level, alpha: Math.max(0, level - 2) };
}

/** Σ count × defense of a garrison of `family`. */
export function defensePower(garrison: BeastCounts, family: string): number {
  return BEAST_TIERS.reduce((sum, tier) => sum + garrison[tier] * beastStats(family, tier).defense, 0);
}

/** Hours a cleared camp takes to refill — mirrors `CampRules.RegrowDuration` (the endgame's Naglfar: 48 h). */
export const NaglfarRegrowHours = 48;
/** Hours an endgame camp stays calm after a fight — mirrors `EndgameRules.EndgameCalm` (other camps: 24 h). */
export const EndgameCalmHours = 1;
/** Hours a beaten endgame camp stays empty before it regrows — mirrors `EndgameRules.TakenGrace`. */
export const EndgameTakenGraceHours = 1;
/** Naglfar's loot pool — mirrors `CampRules.LootPool` for the family: fixed, whatever the level. */
export const NaglfarLootPool = 6000;

/** Hours after a fight an endgame camp is calm (a camp of another family keeps the standard 24 h). */
export function calmHours(family: string): number {
  return isEndgameCampFamily(family) ? EndgameCalmHours : 24;
}

/** Cap of the effective level (the rolled level is far lower; clears raise it up to this). */
export const MaxEffectiveCampLevel = 100;

/** `min(100, level + floor(clears / 10))` — mirrors `CampRules.EffectiveLevel`. */
export function effectiveLevel(level: number, clears: number): number {
  return Math.min(MaxEffectiveCampLevel, level + Math.floor(clears / 10));
}

/** Total loot pool of a camp at effective level `level` — `base × L^0.7`, strong base 1800, weak 450. */
export function lootPool(level: number, strength: CampStrength): number {
  return (strength === 'strong' ? 1800 : 450) * Math.pow(level, 0.7);
}

export type LootKind = keyof ResourceLine;
export interface LootShare {
  kind: LootKind;
  more?: boolean;
}

// Each camp's own loot extras on top of the base rule (docs "Loot"): `more` is the roster's "++".
const LOOT_EXTRAS: Record<string, LootShare[]> = {
  wolfden: [{ kind: 'wood' }],
  boarwallow: [{ kind: 'food', more: true }],
  bearrapids: [{ kind: 'stone' }],
  moosemire: [{ kind: 'food', more: true }],
  eagleeyrie: [{ kind: 'stone' }, { kind: 'iron' }],
  fenrirbrood: [{ kind: 'iron', more: true }],
  beaverlodge: [{ kind: 'wood' }],
  otterslide: [{ kind: 'wood' }],
};
const LOOT_ORDER: LootKind[] = ['food', 'stone', 'wood', 'iron'];

/** The loot kinds a family pays: food always, iron for a strong camp, plus its extras (the whale road: food only). */
export function lootKindsOf(family: string): LootShare[] {
  // The whale road is strong but pays food only (the sea holds no gear to scavenge) — mirrors `CampRules.LootKinds`.
  if (family === 'whaleroad') return [{ kind: 'food' }];
  // Naglfar pays iron 2 : wood 1 : brick (the `stone` field) 1 and no food.
  if (family === 'naglfar') return [{ kind: 'stone' }, { kind: 'wood' }, { kind: 'iron', more: true }];
  const shares = new Map<LootKind, LootShare>([['food', { kind: 'food' }]]);
  if (isStrongCampFamily(family)) shares.set('iron', { kind: 'iron' });
  for (const extra of LOOT_EXTRAS[family] ?? []) {
    shares.set(extra.kind, { kind: extra.kind, more: extra.more || shares.get(extra.kind)?.more });
  }
  return LOOT_ORDER.flatMap((kind) => (shares.has(kind) ? [shares.get(kind)!] : []));
}

/** The full pool split over the family's loot kinds (weight 1, `++` weight 2) — mirrors `CampRules.LootPool`. */
export function lootPoolByKind(family: string, level: number): ResourceLine {
  const pool = isEndgameCampFamily(family) ? NaglfarLootPool : lootPool(level, strengthOf(family));
  const shares = lootKindsOf(family);
  const totalWeight = shares.reduce((sum, s) => sum + (s.more ? 2 : 1), 0);
  const out: ResourceLine = { wood: 0, stone: 0, food: 0, iron: 0 };
  for (const s of shares) out[s.kind] = Math.floor((pool * (s.more ? 2 : 1)) / totalWeight);
  return out;
}

/**
 * What a hunt on this camp can pay before the army's carry cap: `leftover + pool × f`, `f` = the
 * garrison's current defense power over its full defense power (1 for a pristine camp; 0 for an empty one).
 */
export function estimatedLoot(
  family: string,
  level: number,
  garrison: BeastCounts,
  full: BeastCounts,
  leftover: ResourceLine,
): ResourceLine {
  const pool = lootPoolByKind(family, level);
  // An endgame camp pays its whole pool to whoever beats it (not scaled by the crew left) and keeps no leftover: the rest is lost.
  if (isEndgameCampFamily(family)) {
    const crewed = BEAST_TIERS.some((tier) => garrison[tier] > 0);
    const f = crewed ? 1 : 0;
    return { wood: pool.wood * f, stone: pool.stone * f, food: pool.food * f, iron: pool.iron * f };
  }
  const fullPower = defensePower(full, family);
  const f = fullPower > 0 ? Math.min(1, defensePower(garrison, family) / fullPower) : 0;
  return {
    wood: Math.floor(leftover.wood + pool.wood * f),
    stone: Math.floor(leftover.stone + pool.stone * f),
    food: Math.floor(leftover.food + pool.food * f),
    iron: Math.floor(leftover.iron + pool.iron * f),
  };
}

/** Fenrir's brood is never buildable, cleared or not (it always regrows). */
export const NEVER_BUILDABLE_CAMP_FAMILY = 'fenrirbrood';

/** A camp hex can be built on once the camp is cleared (empty) — never Fenrir's brood. Mirrors the server's `HexOccupiedByCamp` rule. */
export function campHexBuildable(camp: { family: string; empty?: boolean }): boolean {
  return camp.empty === true && camp.family !== NEVER_BUILDABLE_CAMP_FAMILY;
}

/** A camp that can burn a tower: strong, and aggressive (live) — an unknown state counts as aggressive (demo / pristine). A water camp (even one with a guard range, Naglfar) only ambushes fleets. */
export function campThreatensTowers(camp: { family?: string; strong: boolean; aggressive?: boolean; empty?: boolean; removed?: boolean }): boolean {
  if (camp.family !== undefined && isWaterCampFamily(camp.family)) return false;
  return camp.strong && camp.aggressive !== false && !camp.empty && !camp.removed;
}

/**
 * The strong, aggressive camp whose guard range covers `coord`, if any — the one that would burn a
 * tower built there unless an army stands guard on it. Not a build lock: building is allowed.
 */
export function towerThreatAt<C extends { family?: string; q: number; r: number; guardRange: number; strong: boolean; aggressive?: boolean; empty?: boolean; removed?: boolean }>(
  camps: Iterable<C>,
  coord: { q: number; r: number },
): C | undefined {
  for (const camp of camps) {
    // A water camp (guard range 0) holds no land and locks no towers.
    if (campThreatensTowers(camp) && camp.guardRange > 0 && hexDistance(coord, camp) <= camp.guardRange) return camp;
  }
  return undefined;
}

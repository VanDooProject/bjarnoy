// Wildlife camp gameplay numbers the client shows — a mirror of the backend's `CampRules`
// (see `docs/design/wildlife-camps.md`, section Gameplay). Pure; the server stays authoritative,
// these only feed the docs page, the tooltip fallback and the hunt panel's loot estimate.
import { hexDistance } from '../hex/coords';
import { isStrongCampFamily, type CampStrength } from './campPlacement';
import type { BeastCounts, BeastTier, ResourceLine } from '../../api/types';

export type { BeastTier };
export const BEAST_TIERS: readonly BeastTier[] = ['young', 'adult', 'alpha'];

/** A beast tier's attack / defense — the stats depend on the camp's strength, not its family. */
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

export function beastStats(strength: CampStrength, tier: BeastTier): BeastStats {
  return BEAST_STATS[strength][tier];
}

/** The pristine garrison at effective level `level` — mirrors `CampRules.FullGarrison`. */
export function fullGarrison(level: number, strength: CampStrength): BeastCounts {
  return strength === 'strong'
    ? { young: 2 + level, adult: 3 + 3 * level, alpha: level - 1 }
    : { young: 2 + level, adult: 3 + 2 * level, alpha: Math.max(0, level - 2) };
}

/** Σ count × defense of a garrison. */
export function defensePower(garrison: BeastCounts, strength: CampStrength): number {
  return BEAST_TIERS.reduce((sum, tier) => sum + garrison[tier] * BEAST_STATS[strength][tier].defense, 0);
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

/** The loot kinds a family pays: food always, iron for a strong camp, plus its extras. */
export function lootKindsOf(family: string): LootShare[] {
  const shares = new Map<LootKind, LootShare>([['food', { kind: 'food' }]]);
  if (isStrongCampFamily(family)) shares.set('iron', { kind: 'iron' });
  for (const extra of LOOT_EXTRAS[family] ?? []) {
    shares.set(extra.kind, { kind: extra.kind, more: extra.more || shares.get(extra.kind)?.more });
  }
  return LOOT_ORDER.flatMap((kind) => (shares.has(kind) ? [shares.get(kind)!] : []));
}

/** The full pool split over the family's loot kinds (weight 1, `++` weight 2) — mirrors `CampRules.LootPool`. */
export function lootPoolByKind(family: string, level: number): ResourceLine {
  const strength: CampStrength = isStrongCampFamily(family) ? 'strong' : 'weak';
  const pool = lootPool(level, strength);
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
  const strength: CampStrength = isStrongCampFamily(family) ? 'strong' : 'weak';
  const fullPower = defensePower(full, strength);
  const f = fullPower > 0 ? Math.min(1, defensePower(garrison, strength) / fullPower) : 0;
  const pool = lootPoolByKind(family, level);
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

/** A camp that can burn a tower: strong, and aggressive (live) — an unknown state counts as aggressive (demo / pristine). */
export function campThreatensTowers(camp: { strong: boolean; aggressive?: boolean; empty?: boolean; removed?: boolean }): boolean {
  return camp.strong && camp.aggressive !== false && !camp.empty && !camp.removed;
}

/**
 * The strong, aggressive camp whose guard range covers `coord`, if any — the one that would burn a
 * tower built there unless an army stands guard on it. Not a build lock: building is allowed.
 */
export function towerThreatAt<C extends { q: number; r: number; guardRange: number; strong: boolean; aggressive?: boolean; empty?: boolean; removed?: boolean }>(
  camps: Iterable<C>,
  coord: { q: number; r: number },
): C | undefined {
  for (const camp of camps) {
    if (campThreatensTowers(camp) && hexDistance(coord, camp) <= camp.guardRange) return camp;
  }
  return undefined;
}

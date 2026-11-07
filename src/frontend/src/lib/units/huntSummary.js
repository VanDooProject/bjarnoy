import { isStrongCampFamily } from '../map/campPlacement';
import { BEAST_TIERS, defensePower, estimatedLoot, fullGarrison } from '../map/campRules';
/** The camp summary for the hunt target — a camp without live state counts as pristine (full garrison, aggressive-capable). */
export function huntSummaryFor(camp, now) {
    const strength = isStrongCampFamily(camp.family) ? 'strong' : 'weak';
    const level = camp.effectiveLevel ?? camp.level;
    const full = camp.fullGarrison ?? fullGarrison(level, strength);
    const garrison = camp.garrison ?? full;
    const calm = camp.calmUntil ? Date.parse(camp.calmUntil) > now : false;
    const status = camp.empty
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
        loot: estimatedLoot(camp.family, level, garrison, full, camp.leftover ?? { wood: 0, stone: 0, food: 0, iron: 0 }),
    };
}
/** Σ count × attack of the selected units (the hunt battle uses plain army attack vs beast defense). */
export function armyAttackPower(unitCounts, byType) {
    let total = 0;
    for (const [type, count] of Object.entries(unitCounts)) {
        if (count > 0)
            total += count * (byType[type]?.attack ?? 0);
    }
    return total;
}
/** A tie goes to the camp, like the server's resolver; an empty camp is a free loot pickup. */
export function huntOutlook(attack, summary) {
    if (summary.status === 'empty')
        return 'empty';
    if (attack <= 0)
        return 'noArmy';
    return attack > summary.campDefense ? 'win' : 'lose';
}

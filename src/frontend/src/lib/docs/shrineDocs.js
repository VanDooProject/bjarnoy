// What the shrines docs page (ShrinesView.vue) shows beyond the building catalogue: each god's favour at a few
// levels (read off buildingEconomy.ts, the client mirror of ShrineCatalogue.Favour) and the rune tables, which have
// no client mirror elsewhere and so are written down here against RuneCatalogue.cs / ShrineCatalogue.Slots /
// Settlement.MaxEffectBonus. Keep the three in step with those files.
import { buildingStatsFor } from '../map/buildingEconomy';
/** The five shrine buildings in the order the table lists their gods. */
export const SHRINE_GODS = [
    { id: 'thor', type: 'shrineofthor' },
    { id: 'freyja', type: 'shrineoffreyja' },
    { id: 'ullr', type: 'shrineofullr' },
    { id: 'njord', type: 'shrineofnjord' },
    { id: 'odin', type: 'odinstatue' },
];
/** The levels the god table spells out: the first, the middle and the last. */
export const FAVOUR_LEVELS = [1, 3, 5];
/** A shrine's favour at `level`, from the same formula the hover card and build menu use. */
export function favourAt(type, level) {
    const modifier = buildingStatsFor(type, level).modifier;
    if (modifier?.kind === 'shrineFavour')
        return { kind: 'percent', percent: modifier.percent };
    if (modifier?.kind === 'odinFavour') {
        return { kind: 'odin', buildTimePercent: modifier.buildTimePercent, visionRings: modifier.visionRings };
    }
    return null;
}
/** Mirrors `ShrineCatalogue.Slots`: rune slots open at a shrine level (1 at levels 1-2, 2 at 3-4, 3 at 5). */
export function runeSlots(level) {
    const scaled = Math.min(Math.max(level, 1), 5);
    return scaled >= 5 ? 3 : scaled >= 3 ? 2 : 1;
}
export const RUNE_RARITIES = ['carved', 'bound', 'blooded'];
/** Mirrors `RuneCatalogue.Effect`: percent per rarity (Carved, Bound, Blooded). */
export const RUNES = [
    { type: 'fehu', effect: 'production', percent: [5, 8, 12] },
    { type: 'jera', effect: 'food', percent: [8, 12, 18] },
    { type: 'othala', effect: 'storage', percent: [10, 15, 25] },
];
/** Mirrors `Settlement.MaxEffectBonus` (0.5): the most any one kind of bonus adds up to, shrines and runes together. */
export const MAX_EFFECT_BONUS_PERCENT = 50;

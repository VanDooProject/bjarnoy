import { buildingStatsFor, } from '../map/buildingEconomy';
import { i18n } from '../../i18n';
import { formatBuildingModifier, formatBuildingOutput } from '../map/buildingStatsText';
import { graphCategoryOf, shortLabel, typeLabel } from './buildingPresentation';
import { ANCHOR, columnX, rowY, TECH_TREE_LAYOUT } from './layout';
// The graph stays English whatever the player's locale (see
// buildingPresentation.ts), so the shared stats text is translated with the
// English messages. A card stands for every level of a bridge, so it says what
// a bridge is for rather than the one level's crossing speed.
const englishText = (key, named) => i18n.global.t(key, named ?? {}, { locale: 'en' });
function formatOutput(output) {
    return formatBuildingOutput(output, englishText);
}
function formatModifier(modifier) {
    if (modifier.kind === 'bridge')
        return 'Opens a wide river to land armies';
    return formatBuildingModifier(modifier, englishText);
}
/**
 * Card-per-type exceptions: one card standing for several building types. Farm
 * and Pumpkin Farm are separate types only because their soil rule differs
 * (Pumpkin Farm needs a Pumpkin-soil island), so the tree shows one card with
 * one unlock level and one prerequisite, and the other type has no slot of its
 * own in `TECH_TREE_LAYOUT`.
 */
export const MERGED_CARDS = {
    farm: { label: 'Farm / Pumpkin Farm (by soil)', absorbs: ['pumpkinfarm'] },
    // The wall hex and its gate share every number (unlock, prerequisite, levels, cost); only a gate's placement rule differs.
    palisade: { label: 'Palisade / Gate', absorbs: ['palisadegate'] },
};
/**
 * A building's unlock level is the longhouse level its *first* level asks for
 * — later levels ask for more, but that is the upgrade curve, not the gate on
 * building one at all.
 */
export function unlockLevel(definitions) {
    return definitions[0]?.requiredLonghouseLevel ?? 1;
}
/** The prerequisites gating a building's construction — those on its level-1 definition. */
export function prerequisitesOf(byType, type) {
    return byType[type]?.[0]?.prerequisites ?? [];
}
/**
 * The cards to draw. A layout slot with no catalogue entry is skipped (so a
 * building removed from the game doesn't leave a hole), and so is a catalogue
 * type with no slot — which is how HIDDEN_FROM_DOCS keeps a building off the
 * page without touching the catalogue.
 */
export function buildTechTreeNodes(byType, layout = TECH_TREE_LAYOUT) {
    const nodes = [];
    for (const [type, [col, row]] of Object.entries(layout)) {
        const definitions = byType[type];
        if (!definitions || definitions.length === 0)
            continue;
        const chips = [];
        if (type === ANCHOR) {
            chips.push({ text: 'Anchor', kind: 'anchor' });
        }
        else {
            chips.push({ text: `LH ${unlockLevel(definitions)}`, kind: 'longhouse' });
            for (const prerequisite of prerequisitesOf(byType, type)) {
                chips.push({
                    text: `${shortLabel(prerequisite.type)} ${prerequisite.level}`,
                    kind: 'building',
                });
            }
        }
        const stats = buildingStatsFor(type, 1);
        nodes.push({
            type,
            label: MERGED_CARDS[type]?.label ?? typeLabel(type),
            gives: stats.output ? formatOutput(stats.output) : stats.modifier ? formatModifier(stats.modifier) : '',
            category: graphCategoryOf(type),
            x: columnX(col),
            y: rowY(row),
            chips,
            isAnchor: type === ANCHOR,
        });
    }
    return nodes;
}

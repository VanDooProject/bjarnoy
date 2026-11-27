// One card per building, built from the live building catalogue: the name,
// what it gives, the longhouse level it needs, and its prerequisites as
// chips. Everything here is real catalogue data — the only thing this file
// decides is how to word it.
import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse, IslandSoil } from '../../api/types';
import {
  buildingStatsFor,
  type BuildingKind,
  type BuildingModifier,
  type BuildingOutput,
} from '../map/buildingEconomy';
import { i18n } from '../../i18n';
import { formatBuildingModifier, formatBuildingOutput, type StatsTranslate } from '../map/buildingStatsText';
import { graphCategoryOf, shortLabel, typeLabel, type GraphCategory } from './buildingPresentation';
import { ANCHOR, columnX, rowY, TECH_TREE_LAYOUT, type Slot } from './layout';

// The graph stays English whatever the player's locale (see
// buildingPresentation.ts), so the shared stats text is translated with the
// English messages. A card stands for every level of a bridge, so it says what
// a bridge is for rather than the one level's crossing speed.
const englishText: StatsTranslate = (key, named) => i18n.global.t(key, named ?? {}, { locale: 'en' }) as string;

function formatOutput(output: BuildingOutput): string {
  return formatBuildingOutput(output, englishText);
}

function formatModifier(modifier: BuildingModifier): string {
  if (modifier.kind === 'bridge') return 'Opens a wide river to land armies';
  return formatBuildingModifier(modifier, englishText);
}

/**
 * Card-per-type exceptions: one card standing for several building types. Farm
 * and Pumpkin Farm are separate types only because their soil rule differs
 * (Farm needs a Wheat-soil island, Pumpkin Farm a Pumpkin-soil one), so the tree shows one card with
 * one unlock level and one prerequisite, and the other type has no slot of its
 * own in `TECH_TREE_LAYOUT`.
 */
export const MERGED_CARDS: Readonly<Record<string, { label: string; absorbs: readonly string[] }>> = {
  farm: { label: 'Farm / Pumpkin Farm (by soil)', absorbs: ['pumpkinfarm'] },
  // The wall hex and its gate share every number (unlock, prerequisite, levels, cost); only a gate's placement rule differs.
  palisade: { label: 'Palisade / Gate', absorbs: ['palisadegate'] },
};

/** The graph stays English like the rest of its card text. */
function soilLabel(soil: IslandSoil): string {
  return soil === 'pumpkin' ? 'Pumpkin soil' : 'Wheat soil';
}

export interface TechTreeChip {
  text: string;
  /** The chip's longer wording, shown as its tooltip. */
  title?: string;
  /** `soil`: what an island of another soil needs instead of the card's plain prerequisites. */
  kind: 'longhouse' | 'building' | 'anchor' | 'soil';
}

export interface TechTreeNode {
  type: string;
  label: string;
  /** The one-line "what it gives you", from the same helper the map tooltip uses. */
  gives: string;
  category: GraphCategory;
  /** Pixel position of the card's top-left corner. */
  x: number;
  y: number;
  chips: TechTreeChip[];
  isAnchor: boolean;
}

/**
 * A building's unlock level is the longhouse level its *first* level asks for
 * — later levels ask for more, but that is the upgrade curve, not the gate on
 * building one at all.
 */
export function unlockLevel(definitions: readonly BuildingDefinitionResponse[]): number {
  return definitions[0]?.requiredLonghouseLevel ?? 1;
}

/** The prerequisites gating a building's construction — those on its level-1 definition. */
export function prerequisitesOf(
  byType: Record<string, BuildingDefinitionResponse[] | undefined>,
  type: string,
): readonly BuildingPrerequisiteResponse[] {
  return byType[type]?.[0]?.prerequisites ?? [];
}

/** The soil the docs treat as the standard one: its prerequisites read as the plain ones, the other soil's as the variant. */
const DEFAULT_SOIL: IslandSoil = 'wheat';

export interface PrerequisiteGroups {
  /** What every island needs plus what the standard (wheat) soil needs. */
  main: BuildingPrerequisiteResponse[];
  /** What another soil needs instead, one entry per soil, e.g. pumpkin soil: Pumpkin Farm 15. */
  variants: { soil: IslandSoil; needs: BuildingPrerequisiteResponse[] }[];
}

/**
 * Splits a building's prerequisites for the docs: the ones a player always reads (untagged and wheat-soil) and, per other soil,
 * the variant that replaces the wheat one there. Text only; the tech-tree graph never draws the variants (they name buildings that
 * have no card of their own, see `buildGraph`).
 */
export function prerequisiteGroups(prerequisites: readonly BuildingPrerequisiteResponse[]): PrerequisiteGroups {
  const main = prerequisites.filter((p) => !p.soil || p.soil === DEFAULT_SOIL);
  const variants: PrerequisiteGroups['variants'] = [];
  for (const p of prerequisites) {
    if (!p.soil || p.soil === DEFAULT_SOIL) continue;
    const group = variants.find((v) => v.soil === p.soil);
    if (group) group.needs.push(p);
    else variants.push({ soil: p.soil, needs: [p] });
  }
  return { main, variants };
}

/**
 * The cards to draw. A layout slot with no catalogue entry is skipped (so a
 * building removed from the game doesn't leave a hole), and so is a catalogue
 * type with no slot — which is how HIDDEN_FROM_DOCS keeps a building off the
 * page without touching the catalogue.
 */
export function buildTechTreeNodes(
  byType: Record<string, BuildingDefinitionResponse[] | undefined>,
  layout: Readonly<Record<string, Slot>> = TECH_TREE_LAYOUT,
): TechTreeNode[] {
  const nodes: TechTreeNode[] = [];

  for (const [type, [col, row]] of Object.entries(layout)) {
    const definitions = byType[type];
    if (!definitions || definitions.length === 0) continue;

    const chips: TechTreeChip[] = [];
    if (type === ANCHOR) {
      chips.push({ text: 'Anchor', kind: 'anchor' });
    } else {
      chips.push({ text: `LH ${unlockLevel(definitions)}`, kind: 'longhouse' });
      const { main, variants } = prerequisiteGroups(prerequisitesOf(byType, type));
      for (const prerequisite of main) {
        chips.push({
          text: `${shortLabel(prerequisite.type)} ${prerequisite.level}`,
          kind: 'building',
        });
      }
      // One chip per other soil, kept short so the card does not grow a second row of chips: "Pumpkin 15" in a dashed chip, with
      // the full wording ("Pumpkin soil: Pumpkin farm 15") as its tooltip.
      for (const variant of variants) {
        chips.push({
          text: `${variant.needs.map((p) => `${shortLabel(p.type)} ${p.level}`).join(', ')}`,
          title: `${soilLabel(variant.soil)}: ${variant.needs.map((p) => `${typeLabel(p.type)} ${p.level}`).join(', ')}`,
          kind: 'soil',
        });
      }
    }

    const stats = buildingStatsFor(type as BuildingKind, 1);

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

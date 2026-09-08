// One card per building, built from the live building catalogue: the name,
// what it gives, the longhouse level it needs, and its prerequisites as
// chips. Everything here is real catalogue data — the only thing this file
// decides is how to word it.
import type { BuildingDefinitionResponse } from '../../api/types';
import { buildingStatsFor, type BuildingKind } from '../map/buildingEconomy';
import { graphCategoryOf, shortLabel, typeLabel, type GraphCategory } from './buildingPresentation';
import { ANCHOR, columnX, rowY, TECH_TREE_LAYOUT, type Slot } from './layout';

export interface TechTreeChip {
  text: string;
  kind: 'longhouse' | 'building' | 'anchor';
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
): readonly { type: string; level: number }[] {
  return byType[type]?.[0]?.prerequisites ?? [];
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
      for (const prerequisite of prerequisitesOf(byType, type)) {
        chips.push({
          text: `${shortLabel(prerequisite.type)} ${prerequisite.level}`,
          kind: 'building',
        });
      }
    }

    const stats = buildingStatsFor(type as BuildingKind, 1);

    nodes.push({
      type,
      label: typeLabel(type),
      gives: stats.output ?? stats.modifier ?? '',
      category: graphCategoryOf(type),
      x: columnX(col),
      y: rowY(row),
      chips,
      isAnchor: type === ANCHOR,
    });
  }

  return nodes;
}

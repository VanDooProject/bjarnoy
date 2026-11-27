// Where each building may stand and which ring category lists it: served by the backend's building catalogue
// (`GET /api/v1/buildings`, or its bundled snapshot in demo mode) and registered here by `stores/buildingCatalogue.ts` as soon
// as it loads. Everything the map and the ring decide about terrain, bog kinds, river shapes and categories reads from this one
// registry, so no client table repeats `BuildingCatalogue.cs`. Before the catalogue has loaded the registry is empty and nothing
// can be placed or offered.
import type { BuildingDefinitionResponse } from '../../api/types';

export interface PlacementRule {
  type: string;
  /** The ring category listing the building, or null when the ring never lists it. */
  category: string | null;
  /** Position within the category (ascending). */
  order: number;
  /** Land terrains it stands on (empty: any land). Unused for a `requiresCoastalWater` building. */
  allowedTerrain: readonly string[];
  requiresCoastalWater: boolean;
  alsoOnCoastalWater: boolean;
  /** Also stands on an inland-lake hex beside land (the Fishing Hut). */
  alsoOnInlandLakeShore: boolean;
  requiresBogKinds: readonly string[];
  alsoOnBogKinds: readonly string[];
  lakeShoreKinds: readonly string[];
  requiresRiverShapes: readonly string[];
  excludedRiverVariants: readonly string[];
  newPlacementDisabled: boolean;
}

/**
 * Types the demo world places that the backend has no definition for: the starter hut, drawn by the landing page and the showcase
 * village. Not in the catalogue, never in the ring.
 */
const DEMO_ONLY_RULES: readonly PlacementRule[] = [
  {
    type: 'hut',
    category: null,
    order: 0,
    allowedTerrain: ['grass'],
    requiresCoastalWater: false,
    alsoOnCoastalWater: false,
    alsoOnInlandLakeShore: false,
    requiresBogKinds: [],
    alsoOnBogKinds: [],
    lakeShoreKinds: [],
    requiresRiverShapes: [],
    excludedRiverVariants: [],
    newPlacementDisabled: false,
  },
];

let rules = new Map<string, PlacementRule>();

/** Registers the placement rules of the catalogue's level-1 entries (every level of a building shares them), replacing earlier ones. */
export function setPlacementRules(definitions: readonly BuildingDefinitionResponse[]): void {
  const next = new Map<string, PlacementRule>();
  for (const rule of DEMO_ONLY_RULES) next.set(rule.type, rule);
  for (const d of definitions) {
    if (d.level !== 1) continue;
    next.set(d.type, {
      type: d.type,
      category: d.ringCategory,
      order: d.ringOrder,
      allowedTerrain: d.allowedTerrain,
      requiresCoastalWater: d.requiresCoastalWater,
      alsoOnCoastalWater: d.alsoOnCoastalWater ?? false,
      alsoOnInlandLakeShore: d.alsoOnInlandLakeShore ?? false,
      requiresBogKinds: d.requiresBogKinds,
      alsoOnBogKinds: d.alsoOnBogKinds,
      lakeShoreKinds: d.lakeShoreKinds,
      requiresRiverShapes: d.requiresRiverShapes,
      excludedRiverVariants: d.excludedRiverVariants,
      newPlacementDisabled: d.newPlacementDisabled,
    });
  }
  rules = next;
}

export function placementRuleFor(type: string | undefined): PlacementRule | undefined {
  return type === undefined ? undefined : rules.get(type);
}

/** Every registered rule, in no particular order. */
export function allPlacementRules(): IterableIterator<PlacementRule> {
  return rules.values();
}

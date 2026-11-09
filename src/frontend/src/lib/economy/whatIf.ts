import type { BuildingDefinitionResponse, ResourceLine } from '../../api/types';
import { costGrowthOf, levelOneBaseCost, niceRound, producerEarlyDiscount, type BuildingKind } from '../map/buildingEconomy';

// "What if the curves were different?": regenerate every level of every
// building type from that type's level-1 row and a handful of growth factors,
// next to the live catalogue. Pure; never touches its input.

export interface WhatIfKnobs {
  /** Cost growth per level of the standard types (×1.30); the types with their own growth (shrines, late buildings) scale by `costGrowth / 1.30`. Not the Longhouse. */
  costGrowth: number;
  /** Longhouse cost growth per level up to level 10. */
  longhouseCostGrowth: number;
  /** Longhouse cost growth per level from level 11 on. */
  longhouseLateCostGrowth: number;
  /** Build time growth per level. */
  timeGrowth: number;
  longhouseTimeGrowth: number;
  /** Growth of the per-level production increment for non-Longhouse types: level L adds `I1 · g^(L−1)` (the Longhouse stays linear: level 1 × level). */
  productionGrowth: number;
  /** Multiplies every non-Longhouse level-1 cost. */
  producerCostScale: number;
  longhouseCostScale: number;
  /** Multiplies every level-1 build time. */
  timeScale: number;
  /** Stock a new settlement starts with (used by the simulation, not the catalogue). */
  foundingStock: ResourceLine;
}

export const DEFAULT_WHAT_IF: WhatIfKnobs = {
  costGrowth: 1.3,
  longhouseCostGrowth: 1.34,
  longhouseLateCostGrowth: 1.6,
  timeGrowth: 1.33,
  longhouseTimeGrowth: 1.33,
  productionGrowth: 1.2,
  producerCostScale: 1,
  longhouseCostScale: 1,
  timeScale: 1,
  foundingStock: { wood: 700, stone: 700, food: 700, iron: 0 },
};

export function defaultWhatIf(): WhatIfKnobs {
  return { ...DEFAULT_WHAT_IF, foundingStock: { ...DEFAULT_WHAT_IF.foundingStock } };
}

const scaleLine = (l: ResourceLine, f: number, map: (v: number) => number = (v) => v): ResourceLine => ({
  wood: map(l.wood * f),
  stone: map(l.stone * f),
  food: map(l.food * f),
  iron: map(l.iron * f),
});

// Manual copy: the input is often a reactive proxy, which structuredClone rejects.
const copyDef = (d: BuildingDefinitionResponse): BuildingDefinitionResponse => ({
  ...d,
  cost: { ...d.cost },
  productionPerHour: { ...d.productionPerHour },
  storageCapacity: { ...d.storageCapacity },
  allowedTerrain: [...d.allowedTerrain],
  prerequisites: d.prerequisites.map((p) => ({ ...p })),
});

/** Types whose per-level cost and time are spelled out in the catalogue (BuildingCatalogue.BridgeLevels), not grown from level 1: copied as is. */
const SPELLED_OUT_TYPES: ReadonlySet<string> = new Set(['bridge']);

/**
 * Mirrors `BuildingCatalogue`'s brick-free levels: no stone up to `levels`, from the next level on the cost's stone is
 * `stone · growth^(level−1)`. The catalogue's level-1 row has no stone there, so the stone it would have is kept here.
 */
const BRICK_FREE: Readonly<Record<string, { levels: number; stone: number }>> = {
  longhouse: { levels: 5, stone: 100 },
  tower: { levels: 5, stone: 200 },
  lumberjack: { levels: 5, stone: 49 },
  reindeerherder: { levels: 5, stone: 36 },
  claybrickworks: { levels: 1, stone: 10 },
};

/** `BuildingCatalogue.ProductionFor`: the level total of an increment-geometric series, `I1 · (g^L − 1) / (g − 1)`. */
const productionFactor = (growth: number, level: number): number =>
  growth === 1 ? level : (growth ** level - 1) / (growth - 1);

/** A new catalogue with every level regenerated from its type's level 1. Types without a level 1 are copied as is. */
export function applyWhatIf(
  byType: Record<string, BuildingDefinitionResponse[]>,
  knobs: WhatIfKnobs,
): Record<string, BuildingDefinitionResponse[]> {
  const out: Record<string, BuildingDefinitionResponse[]> = {};
  for (const [type, defs] of Object.entries(byType)) {
    const first = defs.find((d) => d.level === 1);
    if (!first || SPELLED_OUT_TYPES.has(type)) {
      out[type] = defs.map(copyDef);
      continue;
    }
    const lh = type === 'longhouse';
    const costGrowth = lh ? knobs.longhouseCostGrowth : costGrowthOf(type) * (knobs.costGrowth / DEFAULT_WHAT_IF.costGrowth);
    // The Longhouse grows by its own factor up to level 10 and by the late one from level 11 on (`BuildingCatalogue.LonghouseCostFactor`).
    const costFactorAt = (level: number): number =>
      lh ? costGrowth ** Math.min(level - 1, 9) * knobs.longhouseLateCostGrowth ** Math.max(level - 10, 0) : costGrowth ** (level - 1);
    const timeGrowth = lh ? knobs.longhouseTimeGrowth : knobs.timeGrowth;
    const costScale = lh ? knobs.longhouseCostScale : knobs.producerCostScale;
    const brickFree = BRICK_FREE[type];
    // The level-1 row already carries the producers' level-1 discount (60%) and its rounding: grow from the undiscounted base.
    const discounted = producerEarlyDiscount(type, 1) !== 1;
    const baseCost = discounted ? levelOneBaseCost(type as BuildingKind) : first.cost;
    out[type] = defs.map((d) => {
      const n = d.level - 1;
      const discount = producerEarlyDiscount(type, d.level);
      const grown = scaleLine(baseCost, costScale * costFactorAt(d.level) * discount);
      if (brickFree) grown.stone = d.level <= brickFree.levels ? 0 : brickFree.stone * costScale * costFactorAt(d.level) * discount;
      return {
        ...copyDef(d),
        cost: scaleLine(grown, 1, niceRound),
        buildSeconds: Math.round(first.buildSeconds * knobs.timeScale * timeGrowth ** n),
        productionPerHour: scaleLine(first.productionPerHour, lh ? d.level : productionFactor(knobs.productionGrowth, d.level)),
      };
    });
  }
  return out;
}

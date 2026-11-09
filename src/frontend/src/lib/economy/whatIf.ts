import type { BuildingDefinitionResponse, ResourceLine } from '../../api/types';
import { DEFAULT_EARLY_DISCOUNT, costGrowthOf, isEarlyDiscountType, levelOneBaseCost, niceRound, type BuildingKind } from '../map/buildingEconomy';

// "What if the curves were different?": regenerate every level of every
// building type from that type's level-1 row and a handful of growth factors,
// next to the live catalogue. Pure; never touches its input.

export interface WhatIfKnobs {
  /** Cost growth per level of the standard types (×1.30); the types with their own growth (shrines, late buildings) scale by `costGrowth / 1.30`. Not the Longhouse, the Storage House or the Great Storehouse (own knobs below). */
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
  /** The Longhouse level after which its late growth (`longhouseLateCostGrowth`) applies: levels up to it grow by `longhouseCostGrowth`. */
  longhouseBreakLevel: number;
  /** Price factors of levels 1, 2 and 3 of the resource producers (`ProducerEarlyDiscount`). */
  producerEarlyDiscount: [number, number, number];
  /** Per type: output per hour at level 1 (its one resource), replacing the live level-1 row. A type left out keeps the live value. */
  levelOneOutput: Record<string, number>;
  /** Storage House: what level 1 holds (of each resource), the growth of the per-level gain, and the cost growth per level. */
  storageHouseCapacity: number;
  storageHouseCapacityGrowth: number;
  storageHouseCostGrowth: number;
  /** Great Storehouse, the same three. */
  greatStorehouseCapacity: number;
  greatStorehouseCapacityGrowth: number;
  greatStorehouseCostGrowth: number;
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
  longhouseBreakLevel: 10,
  producerEarlyDiscount: [...DEFAULT_EARLY_DISCOUNT],
  levelOneOutput: {},
  storageHouseCapacity: 300,
  storageHouseCapacityGrowth: 1.22,
  storageHouseCostGrowth: 1.2,
  greatStorehouseCapacity: 50_000,
  greatStorehouseCapacityGrowth: 1.25,
  greatStorehouseCostGrowth: 1.23,
};

export function defaultWhatIf(): WhatIfKnobs {
  return {
    ...DEFAULT_WHAT_IF,
    foundingStock: { ...DEFAULT_WHAT_IF.foundingStock },
    producerEarlyDiscount: [...DEFAULT_WHAT_IF.producerEarlyDiscount],
    levelOneOutput: { ...DEFAULT_WHAT_IF.levelOneOutput },
  };
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

const sumLine = (l: ResourceLine): number => l.wood + l.stone + l.food + l.iron;

/** Storage types: capacity and cost growth come from their own knobs, not from `costGrowth`. */
function storageKnobs(type: string, k: WhatIfKnobs): { capacity: number; capacityGrowth: number; costGrowth: number } | null {
  if (type === 'storagehouse') return { capacity: k.storageHouseCapacity, capacityGrowth: k.storageHouseCapacityGrowth, costGrowth: k.storageHouseCostGrowth };
  if (type === 'greatstorehouse') return { capacity: k.greatStorehouseCapacity, capacityGrowth: k.greatStorehouseCapacityGrowth, costGrowth: k.greatStorehouseCostGrowth };
  return null;
}

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
    const storage = storageKnobs(type, knobs);
    const costGrowth = lh
      ? knobs.longhouseCostGrowth
      : (storage?.costGrowth ?? costGrowthOf(type) * (knobs.costGrowth / DEFAULT_WHAT_IF.costGrowth));
    // The Longhouse grows by its own factor up to the break level and by the late one after it (`BuildingCatalogue.LonghouseCostFactor`).
    const brk = Math.max(1, Math.floor(knobs.longhouseBreakLevel));
    const costFactorAt = (level: number): number =>
      lh ? costGrowth ** Math.min(level - 1, brk - 1) * knobs.longhouseLateCostGrowth ** Math.max(level - brk, 0) : costGrowth ** (level - 1);
    const discountAt = (level: number): number => (isEarlyDiscountType(type) ? (knobs.producerEarlyDiscount[level - 1] ?? 1) : 1);
    // A type's level-1 output override scales its whole (single-resource) series; the Longhouse and unlisted types keep the live row.
    const override = lh ? undefined : knobs.levelOneOutput[type];
    const liveTotal = sumLine(first.productionPerHour);
    const outputScale = override !== undefined && liveTotal > 0 ? override / liveTotal : 1;
    const timeGrowth = lh ? knobs.longhouseTimeGrowth : knobs.timeGrowth;
    const costScale = lh ? knobs.longhouseCostScale : knobs.producerCostScale;
    const brickFree = BRICK_FREE[type];
    // The level-1 row already carries the producers' level-1 discount (60%) and its rounding: grow from the undiscounted base.
    const discounted = isEarlyDiscountType(type);
    const baseCost = discounted ? levelOneBaseCost(type as BuildingKind) : first.cost;
    out[type] = defs.map((d) => {
      const n = d.level - 1;
      const discount = discountAt(d.level);
      const grown = scaleLine(baseCost, costScale * costFactorAt(d.level) * discount);
      if (brickFree) grown.stone = d.level <= brickFree.levels ? 0 : brickFree.stone * costScale * costFactorAt(d.level) * discount;
      return {
        ...copyDef(d),
        cost: scaleLine(grown, 1, niceRound),
        buildSeconds: Math.round(first.buildSeconds * knobs.timeScale * timeGrowth ** n),
        productionPerHour: scaleLine(first.productionPerHour, lh ? d.level : outputScale * productionFactor(knobs.productionGrowth, d.level)),
        storageCapacity: storage
          ? scaleLine({ wood: 1, stone: 1, food: 1, iron: 1 }, storage.capacity * productionFactor(storage.capacityGrowth, d.level))
          : { ...d.storageCapacity },
      };
    });
  }
  return out;
}

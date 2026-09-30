import type { BuildingDefinitionResponse, ResourceLine } from '../../api/types';

// "What if the curves were different?": regenerate every level of every
// building type from that type's level-1 row and a handful of growth factors,
// next to the live catalogue. Pure; never touches its input.

export interface WhatIfKnobs {
  /** Cost growth per level, every type but the Longhouse. */
  costGrowth: number;
  longhouseCostGrowth: number;
  /** Build time growth per level. */
  timeGrowth: number;
  longhouseTimeGrowth: number;
  /** Production growth per level for non-Longhouse types (the Longhouse stays linear: level 1 × level). */
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

const scaleLine = (l: ResourceLine, f: number): ResourceLine => ({
  wood: l.wood * f,
  stone: l.stone * f,
  food: l.food * f,
  iron: l.iron * f,
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

/** A new catalogue with every level regenerated from its type's level 1. Types without a level 1 are copied as is. */
export function applyWhatIf(
  byType: Record<string, BuildingDefinitionResponse[]>,
  knobs: WhatIfKnobs,
): Record<string, BuildingDefinitionResponse[]> {
  const out: Record<string, BuildingDefinitionResponse[]> = {};
  for (const [type, defs] of Object.entries(byType)) {
    const first = defs.find((d) => d.level === 1);
    if (!first) {
      out[type] = defs.map(copyDef);
      continue;
    }
    const lh = type === 'longhouse';
    const costGrowth = lh ? knobs.longhouseCostGrowth : knobs.costGrowth;
    const timeGrowth = lh ? knobs.longhouseTimeGrowth : knobs.timeGrowth;
    const costScale = lh ? knobs.longhouseCostScale : knobs.producerCostScale;
    out[type] = defs.map((d) => {
      const n = d.level - 1;
      return {
        ...copyDef(d),
        cost: scaleLine(first.cost, costScale * costGrowth ** n),
        buildSeconds: Math.round(first.buildSeconds * knobs.timeScale * timeGrowth ** n),
        productionPerHour: scaleLine(first.productionPerHour, lh ? d.level : knobs.productionGrowth ** n),
      };
    });
  }
  return out;
}

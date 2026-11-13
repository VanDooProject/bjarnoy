import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse, ResourceLine } from '../../api/types';

const ZERO: ResourceLine = { wood: 0, stone: 0, food: 0, iron: 0 };

export interface DefOpts {
  cost?: Partial<ResourceLine>;
  buildSeconds?: number;
  prod?: Partial<ResourceLine>;
  storage?: number;
  reqLh?: number;
  prereqs?: BuildingPrerequisiteResponse[];
}

/** Hand-made catalogue row for tests. */
export function def(type: string, level: number, o: DefOpts = {}): BuildingDefinitionResponse {
  return {
    type,
    level,
    cost: { ...ZERO, ...o.cost },
    buildSeconds: o.buildSeconds ?? 60,
    productionPerHour: { ...ZERO, ...o.prod },
    storageCapacity: { wood: o.storage ?? 0, stone: o.storage ?? 0, food: o.storage ?? 0, iron: o.storage ?? 0 },
    allowedTerrain: [],
    requiresCoastalWater: false,
    requiredLonghouseLevel: o.reqLh ?? 1,
    // Mirrors BuildingCatalogue.SlotCostFor: a Longhouse upgrade takes the slots its previous level gave.
    slotCost: type === 'longhouse' ? Math.max(2, 1 + Math.floor((level - 1) / 2)) : 1 + Math.floor(level / 6),
    claimRadius: 0,
    prerequisites: o.prereqs ?? [],
    ringCategory: null,
    ringOrder: 0,
    newPlacementDisabled: false,
    requiresBogKinds: [],
    alsoOnBogKinds: [],
    lakeShoreKinds: [],
    requiresRiverShapes: [],
    excludedRiverVariants: [],
  };
}

export function group(defs: BuildingDefinitionResponse[]): Record<string, BuildingDefinitionResponse[]> {
  const out: Record<string, BuildingDefinitionResponse[]> = {};
  for (const d of defs) (out[d.type] ??= []).push(d);
  for (const l of Object.values(out)) l.sort((a, b) => a.level - b.level);
  return out;
}

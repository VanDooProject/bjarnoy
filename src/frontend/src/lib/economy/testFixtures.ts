import type { BuildingDefinitionResponse, BuildingPrerequisiteResponse, ResourceLine } from '../../api/types';

const ZERO: ResourceLine = { wood: 0, stone: 0, food: 0, iron: 0 };

export interface DefOpts {
  cost?: Partial<ResourceLine>;
  buildSeconds?: number;
  prod?: Partial<ResourceLine>;
  storage?: number;
  reqLh?: number;
  prereqs?: BuildingPrerequisiteResponse[];
  occupiesAllSlots?: boolean;
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
    slotCost: 1,
    occupiesAllSlots: o.occupiesAllSlots ?? type === 'longhouse',
    claimRadius: 0,
    prerequisites: o.prereqs ?? [],
  };
}

export function group(defs: BuildingDefinitionResponse[]): Record<string, BuildingDefinitionResponse[]> {
  const out: Record<string, BuildingDefinitionResponse[]> = {};
  for (const d of defs) (out[d.type] ??= []).push(d);
  for (const l of Object.values(out)) l.sort((a, b) => a.level - b.level);
  return out;
}

import type { BuildingDefinitionResponse, ResourceLine } from '../../api/types';

/** One level of one building type, reduced to the numbers a designer charts. */
export interface LevelCurvePoint {
  level: number;
  /** wood + stone + food + iron. */
  totalCost: number;
  cost: ResourceLine;
  buildMinutes: number;
  /** Sum over all four resources of the level's own production per hour. */
  productionPerHour: number;
  /**
   * totalCost / (production of this level − production of the previous level),
   * in hours. `null` when the level adds no production (storage, military …).
   */
  paybackHours: number | null;
}

export function sumLine(line: ResourceLine): number {
  return line.wood + line.stone + line.food + line.iron;
}

/** Per-level economy curves for one building type. Reads only the catalogue rows it is given. */
export function curvesFor(defs: BuildingDefinitionResponse[]): LevelCurvePoint[] {
  const sorted = [...defs].sort((a, b) => a.level - b.level);
  const points: LevelCurvePoint[] = [];
  let previousProduction = 0;
  for (const def of sorted) {
    const totalCost = sumLine(def.cost);
    const production = sumLine(def.productionPerHour);
    const gained = production - previousProduction;
    points.push({
      level: def.level,
      totalCost,
      cost: { ...def.cost },
      buildMinutes: def.buildSeconds / 60,
      productionPerHour: production,
      paybackHours: gained > 0 ? totalCost / gained : null,
    });
    previousProduction = production;
  }
  return points;
}

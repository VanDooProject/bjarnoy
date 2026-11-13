// Layout of the training page's unit dependency graph (docs/design/units-and-ships.md section 5): one lane per training building,
// every unit at the building level that opens it, an arrow from a prerequisite unit to the unit that needs it. Pure data in,
// positions out, so it is unit-testable without mounting anything; UnitDependencyGraph.vue only draws it.
import type { UnitDefinitionResponse } from '../../api/types';

export const GRAPH_MAX_LEVEL = 20;
export const GRAPH_NODE_W = 80;
export const GRAPH_COL = 40;
/** Room left of the first level column, so the nodes of level 1 are not cut off. */
export const GRAPH_X0 = GRAPH_NODE_W / 2 + 4;
export const GRAPH_NODE_H = 22;
export const GRAPH_TOP = 30;
const STACK_STEP = 26;
const LANE_PAD = 18;

export interface GraphNode {
  type: string;
  building: string;
  /** The building level that opens the unit. */
  level: number;
  /** The unit's own Longhouse gate when it is above what its building's unlock already needs; else null. */
  longhouseBadge: number | null;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** The prerequisite stands in another building's lane. */
  cross: boolean;
}

export interface GraphLane {
  building: string;
  top: number;
  height: number;
  /** The Longhouse level that opens the building, when known. */
  unlockLonghouse: number | null;
}

export interface UnitGraphLayout {
  lanes: GraphLane[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Lays out `definitions`. `buildingUnlockLonghouse` gives the Longhouse level at which a training building itself opens (from
 * the building catalogue); a unit shows a Longhouse badge only when its own gate is above that.
 */
export function layoutUnitGraph(
  definitions: UnitDefinitionResponse[],
  buildingUnlockLonghouse: (building: string) => number | null,
): UnitGraphLayout {
  const buildings: string[] = [];
  for (const d of definitions) if (!buildings.includes(d.requiredBuildingType)) buildings.push(d.requiredBuildingType);

  const lanes: GraphLane[] = [];
  const nodes: GraphNode[] = [];
  let top = GRAPH_TOP;
  for (const building of buildings) {
    const units = definitions
      .filter((d) => d.requiredBuildingType === building)
      .sort((a, b) => a.requiredBuildingLevel - b.requiredBuildingLevel);
    const unlock = buildingUnlockLonghouse(building);
    const stacked = new Map<number, number>();
    let deepest = 1;
    for (const d of units) {
      const k = stacked.get(d.requiredBuildingLevel) ?? 0;
      stacked.set(d.requiredBuildingLevel, k + 1);
      deepest = Math.max(deepest, k + 1);
      nodes.push({
        type: d.type,
        building,
        level: d.requiredBuildingLevel,
        longhouseBadge: unlock !== null && d.requiredLonghouseLevel > unlock ? d.requiredLonghouseLevel : null,
        x: GRAPH_X0 + GRAPH_COL * (d.requiredBuildingLevel - 0.5),
        y: top + LANE_PAD + k * STACK_STEP,
      });
    }
    const height = LANE_PAD + deepest * STACK_STEP + 6;
    lanes.push({ building, top, height, unlockLonghouse: unlock });
    top += height;
  }

  const edges: GraphEdge[] = [];
  for (const d of definitions) {
    if (!d.requiredUnitType) continue;
    const from = definitions.find((o) => o.type === d.requiredUnitType);
    if (!from) continue;
    edges.push({ from: from.type, to: d.type, cross: from.requiredBuildingType !== d.requiredBuildingType });
  }

  return { lanes, nodes, edges, width: GRAPH_X0 + GRAPH_COL * GRAPH_MAX_LEVEL + 90, height: top + 6 };
}

/** The svg path of one edge between two laid-out nodes (see layoutUnitGraph). */
export function edgePath(from: GraphNode, to: GraphNode, cross: boolean): string {
  const half = GRAPH_NODE_W / 2;
  const badge = from.longhouseBadge !== null ? 38 : 0;
  if (cross || from.x >= to.x) {
    // Down a gutter right of the source (also for units that share a level in one lane), then back left onto the right edge of the target: stacked targets each get their own arrow.
    const x1 = from.x + half + badge;
    const gx = x1 + 8;
    const x2 = to.x + half + 3;
    return `M${x1} ${from.y} H${gx - 6} Q${gx} ${from.y} ${gx} ${from.y + 6} V${to.y - 6} Q${gx} ${to.y} ${gx - 6} ${to.y} H${x2}`;
  }
  const x1 = from.x + half + badge;
  const x2 = to.x - half - 2;
  const mid = Math.max(x1 + 20, (x1 + x2) / 2);
  return `M${x1} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${x2} ${to.y}`;
}

/** The units of one building in the order the phone list shows them: by building level, then catalogue order. */
export function unitsByLevel(
  definitions: UnitDefinitionResponse[],
  building: string,
): { level: number; units: UnitDefinitionResponse[] }[] {
  const levels = new Map<number, UnitDefinitionResponse[]>();
  for (const d of definitions) {
    if (d.requiredBuildingType !== building) continue;
    const list = levels.get(d.requiredBuildingLevel) ?? [];
    list.push(d);
    levels.set(d.requiredBuildingLevel, list);
  }
  return [...levels].sort((a, b) => a[0] - b[0]).map(([level, units]) => ({ level, units }));
}

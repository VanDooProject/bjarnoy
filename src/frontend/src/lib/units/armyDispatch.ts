// Issue #40 phase 2: pure helpers behind the dispatch/waypoint-editing flow
// (ArmyPanel.vue, stores/world.ts) — kept separate and dependency-free so
// they're unit-testable without mounting a component or a Pinia store, same
// reasoning as lib/units/trainingEconomy.ts.
import type { AxialCoord } from '../hex/coords';
import type { DispatchArmyRequest, HexPoint, UnitDefinitionResponse } from '../../api/types';

/**
 * Converts an ordered list of clicked hexes into the shape `DispatchArmyRequest`
 * wants: every hex but the last is an intermediate waypoint, the last is the
 * destination. Only meaningful for a `move` dispatch (the only mission this
 * phase's UI builds) — `waypoints`/`destination` are ignored by the backend
 * for attack/support/raid, whose destination is always the target
 * settlement's own hex.
 */
export function routeToWaypointsAndDestination(
  route: AxialCoord[],
): { waypoints: HexPoint[]; destination: HexPoint | undefined } {
  if (route.length === 0) return { waypoints: [], destination: undefined };
  const destination = route[route.length - 1];
  const waypoints = route.slice(0, -1).map((c) => ({ q: c.q, r: c.r }));
  return { waypoints, destination: { q: destination.q, r: destination.r } };
}

/** Builds a `move`-mission `DispatchArmyRequest` from a unit-count map, a clicked route, and provisions. */
export function buildMoveDispatchRequest(
  unitCounts: Record<string, number>,
  route: AxialCoord[],
  provisions: number,
): DispatchArmyRequest | null {
  const units = Object.entries(unitCounts)
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => ({ unit, count }));
  if (units.length === 0 || route.length === 0) return null;

  const { waypoints, destination } = routeToWaypointsAndDestination(route);
  return {
    units,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    destination,
    provisions,
    mission: 'move',
  };
}

/**
 * The most food a dispatch can carry: capped by the units' combined
 * `foodCarryCapacity` (what they can physically carry) and by what the
 * settlement's own food stock can afford — mirrors the backend's
 * `ProvisionsExceedCarryCapacity`/`InsufficientResources` rejections, so the
 * default the dispatch UI proposes is (almost) never refused for either
 * reason on its own (the round-trip-upkeep check still runs server-side).
 */
export function maxAffordableProvisions(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
  foodStock: number,
): number {
  let carryCapacity = 0;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    const definition = byType[type];
    if (!definition) continue;
    carryCapacity += definition.foodCarryCapacity * count;
  }
  return Math.max(0, Math.min(carryCapacity, foodStock));
}

/** Total upkeep/hour for a chosen unit-count map, for an at-a-glance "this costs N food/h" line. */
export function totalUpkeepPerHour(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): number {
  let total = 0;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    const definition = byType[type];
    if (!definition) continue;
    total += definition.upkeepPerHour * count;
  }
  return total;
}

/** `"2h 14m"` / `"14m 6s"` / `"6s"` / `"Arriving"` for a countdown to an ISO timestamp, as of `now` (ms epoch). */
export function formatEta(targetIso: string, now: number): string {
  const totalSeconds = Math.round((new Date(targetIso).getTime() - now) / 1000);
  if (totalSeconds <= 0) return 'Arriving';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * A short status label for an army row — mirrors the backend's own
 * mutually-exclusive location states (`AtHome`/`Supporting`/`InTransit`,
 * with `Movement.IsReturning` distinguishing outbound from the trip home).
 */
export function armyStatusLabel(army: {
  atHome: boolean;
  supporting: boolean;
  movement: { isReturning: boolean } | null;
}): 'At home' | 'Supporting' | 'In transit' | 'Returning' {
  if (army.atHome) return 'At home';
  if (army.supporting) return 'Supporting';
  if (army.movement?.isReturning) return 'Returning';
  return 'In transit';
}

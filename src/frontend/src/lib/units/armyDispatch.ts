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
 * Builds an `attack`-mission `DispatchArmyRequest` from a unit-count map, a
 * clicked route, and provisions. Unlike `buildMoveDispatchRequest`, the
 * clicked route is never split into "waypoints + final destination" — the
 * backend ignores `destination` for an attack dispatch and always resolves
 * it server-side to the target settlement's own hex (see
 * `ArmyService.DispatchAsync`), so every clicked hex here is just an
 * intermediate waypoint on the way to `targetSettlementId`.
 *
 * `targetBuildingCoord` (issue #40 phase 5): the coordinate of a building
 * within the target settlement the player would prefer any surviving
 * catapults hit on arrival — see `DispatchArmyRequest.targetBuildingCoord`'s
 * own comment. Omit (or pass `null`/`undefined`) for "no preference", the
 * same as never having picked one; `SiegeResolver` then falls back to a
 * seeded random pick server-side. Not validated here against the target's
 * actual layout — that can change before the army arrives — only forwarded
 * as-is.
 */
export function buildAttackDispatchRequest(
  unitCounts: Record<string, number>,
  route: AxialCoord[],
  provisions: number,
  targetSettlementId: string | null,
  targetBuildingCoord?: HexPoint | null,
): DispatchArmyRequest | null {
  const units = Object.entries(unitCounts)
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => ({ unit, count }));
  if (units.length === 0 || !targetSettlementId) return null;

  const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
  return {
    units,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    provisions,
    mission: 'attack',
    targetSettlementId,
    targetBuildingCoord: targetBuildingCoord ?? undefined,
  };
}

/**
 * Issue #40 phase 6 §1: which unit-class family a garrison selection is
 * drawing from, so `ArmyPanel.vue` can grey out the class the player hasn't
 * picked yet — cheaply catching the backend's `MixedFleetAndLandUnits`
 * rejection (`Army.PlanDispatch`) before a request is even built, rather than
 * only learning about it from a 409 after clicking dispatch.
 *
 * `'none'` when nothing is selected yet (either class still pickable),
 * `'fleet'`/`'land'` once every selected unit agrees on a class, `'mixed'`
 * when both are present at once — which the UI should never actually let the
 * player reach (see `isUnitSelectableFor`), but is reported honestly rather
 * than silently picked one way, in case a stale draft ever gets here (e.g.
 * a unit's class changing between catalogue reloads).
 */
export type FleetSelectionKind = 'none' | 'fleet' | 'land' | 'mixed';

export function classifyUnitSelection(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): FleetSelectionKind {
  let hasShip = false;
  let hasNonShip = false;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    const definition = byType[type];
    if (!definition) continue;
    if (definition.class === 'ship') hasShip = true;
    else hasNonShip = true;
  }
  if (hasShip && hasNonShip) return 'mixed';
  if (hasShip) return 'fleet';
  if (hasNonShip) return 'land';
  return 'none';
}

/**
 * Whether a garrison row for `type` should accept more units given the
 * dispatch's current `selection` kind — the other class family is locked out
 * once one is committed to, so the player can't build a mixed request in the
 * first place (see `classifyUnitSelection`). Both families stay open while
 * nothing is selected (`'none'`); a `'mixed'` selection (shouldn't happen,
 * see `classifyUnitSelection`'s own comment) locks out nothing further, since
 * there is no single class left to prefer.
 */
export function isUnitSelectableFor(
  type: string,
  selection: FleetSelectionKind,
  byType: Record<string, UnitDefinitionResponse>,
): boolean {
  if (selection === 'none' || selection === 'mixed') return true;
  const isShip = byType[type]?.class === 'ship';
  return selection === 'fleet' ? isShip : !isShip;
}

/**
 * True when `unitCounts` sends at least one Catapult — the gate `ArmyPanel.vue`
 * uses to decide whether the "preferred target building" picker is even worth
 * showing (issue #40 phase 5): a catapult-free attack does no siege damage
 * regardless of what's requested, per `SiegeResolver.Resolve`.
 */
export function hasCatapultSelected(unitCounts: Record<string, number>): boolean {
  return (unitCounts.catapult ?? 0) > 0;
}

/**
 * Builds a `support`-mission `DispatchArmyRequest` — identical shape to
 * `buildAttackDispatchRequest` (a target settlement plus optional waypoints,
 * no split-off "destination" the way `move` gets), since both missions
 * resolve their real destination server-side to the target settlement's own
 * hex (see `ArmyService.DispatchAsync`). Kept as its own function rather than
 * reusing `buildAttackDispatchRequest` under the hood so each mission's
 * request-building stays a one-line, self-contained read at the call site —
 * mirrors why `buildAttackDispatchRequest` doesn't share `buildMoveDispatchRequest`.
 */
export function buildSupportDispatchRequest(
  unitCounts: Record<string, number>,
  route: AxialCoord[],
  provisions: number,
  targetSettlementId: string | null,
): DispatchArmyRequest | null {
  const units = Object.entries(unitCounts)
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => ({ unit, count }));
  if (units.length === 0 || !targetSettlementId) return null;

  const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
  return {
    units,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    provisions,
    mission: 'support',
    targetSettlementId,
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
 *
 * `targetSettlementName` (issue #40 phase 4): when a Support army has
 * arrived (`supporting: true`), the row should read "Supporting <name>"
 * rather than the bare "Supporting" — the whole point of the owner's
 * "armies abroad" view is knowing *where* each army sits. Pass the name
 * resolved from `army.targetSettlementId` (e.g. via `WorldModel.getSettlement`)
 * when it's known; omit it (or pass `null`, e.g. before the world-settlements
 * list has loaded that settlement) to fall back to the bare label rather than
 * showing a misleading placeholder.
 */
export function armyStatusLabel(
  army: {
    atHome: boolean;
    supporting: boolean;
    movement: { isReturning: boolean } | null;
  },
  targetSettlementName?: string | null,
): string {
  if (army.atHome) return 'At home';
  if (army.supporting) return targetSettlementName ? `Supporting ${targetSettlementName}` : 'Supporting';
  if (army.movement?.isReturning) return 'Returning';
  return 'In transit';
}

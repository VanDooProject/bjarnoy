// Issue #40 phase 2: pure helpers behind the dispatch/waypoint-editing flow
// (ArmyPanel.vue, stores/world.ts) — kept separate and dependency-free so
// they're unit-testable without mounting a component or a Pinia store, same
// reasoning as lib/units/trainingEconomy.ts.
import { hexDistance, type AxialCoord } from '../hex/coords';
import type { DispatchArmyRequest, DispatchFromSpot, FieldOrderRequest, HexPoint, UnitDefinitionResponse } from '../../api/types';
import { i18n } from '../../i18n';
import { isShoreBuildingHex, type TerrainLookup } from '../map/shoreline';

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

/** Shared body of the move-shaped dispatches: the last clicked hex is the destination, every hex before it a waypoint. */
function buildRouteDispatchRequest(
  mission: 'move' | 'found',
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
): DispatchArmyRequest | null {
  if (from.length === 0 || route.length === 0) return null;

  const { waypoints, destination } = routeToWaypointsAndDestination(route);
  return {
    from,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    destination,
    provisions,
    mission,
  };
}

/** Builds a `move`-mission `DispatchArmyRequest` from the units grouped by spot, a clicked route, and provisions. */
export function buildMoveDispatchRequest(
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
): DispatchArmyRequest | null {
  return buildRouteDispatchRequest('move', from, route, provisions);
}

/**
 * Builds a `found`-mission `DispatchArmyRequest`: shaped exactly like a move (the route's last hex is where the
 * settlement is founded). The server checks the five settlers, renown and spacing.
 */
export function buildFoundDispatchRequest(
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
): DispatchArmyRequest | null {
  return buildRouteDispatchRequest('found', from, route, provisions);
}

/** Whether the clicked route's last hex is the destination: a move walks there, a founding settles there. */
export function isRouteDestination(mission: string | undefined, index: number, routeLength: number): boolean {
  return (mission === 'move' || mission === 'found') && index === routeLength - 1;
}

/**
 * Whether a dispatch draft has what its mission needs to aim at: a target settlement (attack/support), a camp (hunt),
 * or a plotted route (move/found — the last click is the destination).
 */
export function dispatchHasDestination(draft: {
  mission: string;
  targetSettlementId: string | null;
  targetCamp: AxialCoord | null;
  route: ReadonlyArray<AxialCoord>;
}): boolean {
  if (draft.mission === 'attack' || draft.mission === 'support') return !!draft.targetSettlementId;
  if (draft.mission === 'hunt') return !!draft.targetCamp;
  return draft.route.length > 0;
}


/**
 * Builds an `attack`-mission `DispatchArmyRequest` from the units grouped by spot, a
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
 * seeded random pick server-side. A fleet must always name one (a building on
 * the target's shore; the server rejects the dispatch without it). Not validated here against the target's
 * actual layout — that can change before the army arrives — only forwarded
 * as-is.
 */
export function buildAttackDispatchRequest(
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
  targetSettlementId: string | null,
  targetBuildingCoord?: HexPoint | null,
): DispatchArmyRequest | null {
  if (from.length === 0 || !targetSettlementId) return null;

  const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
  return {
    from,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    provisions,
    mission: 'attack',
    targetSettlementId,
    targetBuildingCoord: targetBuildingCoord ?? undefined,
  };
}

/**
 * Builds a `hunt`-mission `DispatchArmyRequest` against a wildlife camp: the camp's own hex is the
 * `destination` (the server walks to the nearest reachable neighbour when the hex itself is not
 * walkable) and `route` holds only intermediate waypoints. `null` without units or a camp target.
 * Land units only against land camps and ships only against a water camp (the whale road) is enforced by the UI
 * (`isHuntUnit`) and by the server (`HuntRequiresLandUnits` / `HuntRequiresFleet`).
 */
export function buildHuntDispatchRequest(
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
  targetCamp: AxialCoord | null,
): DispatchArmyRequest | null {
  if (from.length === 0 || !targetCamp) return null;

  const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
  return {
    from,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    destination: { q: targetCamp.q, r: targetCamp.r },
    provisions,
    mission: 'hunt',
  };
}

/**
 * Whether a unit type may join a hunt: land units against a land camp; against a water camp (`atSea`, the whale road) the
 * ships, and any land unit as their passenger.
 */
export function isHuntUnit(type: string, byType: Record<string, UnitDefinitionResponse>, atSea = false): boolean {
  const definition = byType[type];
  if (!definition) return false;
  return atSea ? true : definition.class !== 'ship';
}

/** Whether a garrison holds any unit that may lead the hunt (`atSea`: a ship for a water camp, a land unit otherwise). */
export function garrisonCanHunt(
  garrison: ReadonlyArray<{ unit: string; count: number }>,
  byType: Record<string, UnitDefinitionResponse>,
  atSea: boolean,
): boolean {
  return garrison.some((g) => {
    if (g.count <= 0 || !isHuntUnit(g.unit, byType, atSea)) return false;
    return !atSea || byType[g.unit]?.class === 'ship';
  });
}

/** What a field order is for, beyond the route: the mission and its target, and which units leave. */
export interface FieldOrderOptions {
  mission?: 'move' | 'attack' | 'support' | 'hunt';
  targetSettlementId?: string | null;
  targetBuildingCoord?: AxialCoord | null;
  /** The units that leave (a standing army splits); omitted or `null` sends the whole army. */
  units?: Record<string, number> | null;
}

/**
 * Builds a `FieldOrderRequest` from a clicked route (issue #156 phase 1) —
 * same split as `routeToWaypointsAndDestination` (last click is the
 * destination, everything before it a waypoint), but for an army already out
 * in the field rather than one being dispatched from a garrison. `null` when
 * the order is incomplete: a move or hunt always needs a destination (a hunt's
 * is the camp's hex), an attack or support a target settlement (its destination
 * is derived server-side, so the route holds only waypoints), and a `units`
 * selection that leaves nothing sends nothing.
 */
export function buildFieldOrderRequest(route: AxialCoord[], options: FieldOrderOptions = {}): FieldOrderRequest | null {
  const { mission, targetSettlementId, targetBuildingCoord, units } = options;
  const leaving = units
    ? Object.entries(units)
        .filter(([, count]) => count > 0)
        .map(([unit, count]) => ({ unit, count }))
    : undefined;
  if (leaving && leaving.length === 0) return null;

  if (mission === 'attack' || mission === 'support') {
    if (!targetSettlementId) return null;
    // A support names the host's garrison spot it joins (docs/design/garrison.md).
    if (mission === 'support' && !targetBuildingCoord) return null;
    const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
    return {
      waypoints: waypoints.length > 0 ? waypoints : undefined,
      mission,
      targetSettlementId,
      targetBuildingCoord: targetBuildingCoord ? { q: targetBuildingCoord.q, r: targetBuildingCoord.r } : undefined,
      units: leaving,
    };
  }

  if (route.length === 0) return null;
  const { waypoints, destination } = routeToWaypointsAndDestination(route);
  const request: FieldOrderRequest = { waypoints: waypoints.length > 0 ? waypoints : undefined, destination: destination! };
  if (mission) request.mission = mission;
  if (leaving) request.units = leaving;
  return request;
}

/**
 * Whether an army can be given a field order at all (issue #156 phase 1) —
 * standing at its destination or still travelling outbound, on a `move` or
 * `found` mission (see `Army.PlanFieldOrder`'s remarks on why attack/support/
 * raid are out of scope: their destination is always a target settlement's
 * own hex, re-validated by dispatch-time-only checks a bare "new hex" order
 * can't safely reuse). Mirrors the backend's own `NoActiveJourney`/
 * `MissionNotFieldOrderable` rejections closely enough to greylist the button
 * before a doomed request is even sent, the same reasoning
 * `isUnitSelectableFor` applies to fleet/land mixing.
 */
export function canFieldOrderArmy(army: {
  atHome: boolean;
  supporting: boolean;
  mission: string;
  movement: { isReturning: boolean } | null;
}): boolean {
  if (army.atHome || army.supporting) return false;
  if (army.movement?.isReturning) return false;
  return army.mission === 'move' || army.mission === 'found';
}

/**
 * Whether a field-order-eligible army is still travelling to its current
 * destination (an "append goal" order) rather than already standing there
 * (a "move on" order) — mirrors the `arrived` check `Army.PlanFieldOrder`
 * makes server-side. `Army.PlanFieldOrder`'s own rule table has no free cell
 * for appending onto an in-progress leg: unlike a standing "move on" (free
 * with no extra waypoints), *any* mid-march field order costs premium, so
 * this is what `ArmyPanel.vue` greys its "Append goal" button on rather than
 * only learning about `FieldOrderRejection.PremiumRequired` after a click.
 */
export function isFieldOrderMidMarch(
  army: { movement: { isReturning: boolean; arrivesAt: string } | null },
  now: number,
): boolean {
  return army.movement !== null && !army.movement.isReturning && Date.parse(army.movement.arrivesAt) > now;
}

/**
 * Whether a dispatch selection is a fleet: any ship among the selected units makes it one, and the land units selected
 * with it are its passengers (`ShipCargo` in the backend). `'land'` when only land units are selected, `'none'` when
 * nothing is selected yet.
 */
export type FleetSelectionKind = 'none' | 'fleet' | 'land';

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
  if (hasShip) return 'fleet';
  if (hasNonShip) return 'land';
  return 'none';
}

/**
 * The troop slots of a selection that includes ships: `needed` by the land units aboard against `offered` by the ships
 * (`ShipCargo.SlotsNeeded`/`SlotsOffered` in the backend). `null` when no ship is selected (a land army needs no slots).
 */
export function shipSlotUsage(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): { needed: number; offered: number } | null {
  let needed = 0;
  let offered = 0;
  let hasShip = false;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    const definition = byType[type];
    if (!definition) continue;
    if (definition.class === 'ship') hasShip = true;
    needed += definition.cargoSlots * count;
    offered += definition.shipSlots * count;
  }
  return hasShip ? { needed, offered } : null;
}

/** Whether the land units selected need more slots than the selected ships offer — the backend refuses it (`InsufficientShipCapacity`). */
export function exceedsShipCapacity(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): boolean {
  const usage = shipSlotUsage(unitCounts, byType);
  return usage !== null && usage.needed > usage.offered;
}

/** The kinds of building a siege engine can damage — mirrors `SiegeTargets` (`UnitDefinition.SiegeTargets`) in the backend. */
export type SiegeTargetKind = 'walls' | 'towers' | 'buildings';

/**
 * Which kind of siege target a building type is — mirrors `SiegeResolver.KindOf`: wall hexes (palisade, gate), the tower, and
 * every other building (the Longhouse and bridges included).
 */
export function siegeTargetKindOf(buildingType: string): SiegeTargetKind {
  if (buildingType === 'palisade' || buildingType === 'palisadegate') return 'walls';
  if (buildingType === 'tower') return 'towers';
  return 'buildings';
}

/** The kinds of building the selected siege engines (units with siege targets, count above zero) can damage together. */
export function selectedSiegeTargets(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): Set<SiegeTargetKind> {
  const kinds = new Set<SiegeTargetKind>();
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    for (const kind of byType[type]?.siegeTargets ?? []) kinds.add(kind as SiegeTargetKind);
  }
  return kinds;
}

/**
 * True when `unitCounts` sends at least one siege engine (a catapult or a ram) — the gate `ArmyPanel.vue` uses to decide whether
 * the "preferred target building" picker is even worth showing (issue #40 phase 5): an attack without one does no siege damage
 * regardless of what's requested, per `SiegeResolver.Resolve`.
 */
export function hasSiegeEngineSelected(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): boolean {
  return selectedSiegeTargets(unitCounts, byType).size > 0;
}

/** Whether the selected siege engines can damage a `buildingType` building: rams breach walls and towers, catapults the rest. */
export function canSiegeDamage(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
  buildingType: string,
): boolean {
  return selectedSiegeTargets(unitCounts, byType).has(siegeTargetKindOf(buildingType));
}

/** Whether a unit type is a ram-like engine: one that can breach walls. */
export function breachesWalls(type: string, byType: Record<string, UnitDefinitionResponse>): boolean {
  return byType[type]?.siegeTargets?.includes('walls') ?? false;
}

/**
 * Whether the dispatch needs the player to name a building of the target settlement. A fleet attack is always sent at
 * one building on the target's shore (`'required'`); a land attack may name a building for its siege engines to hit
 * (`'optional'`, only worth offering when siege engines are along); everything else names none.
 */
export type TargetBuildingPickerMode = 'none' | 'optional' | 'required';

export function targetBuildingPickerMode(
  mission: string | undefined,
  hasTargetSettlement: boolean,
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
  selection: FleetSelectionKind,
): TargetBuildingPickerMode {
  if (mission !== 'attack' || !hasTargetSettlement) return 'none';
  if (selection === 'fleet') return 'required';
  return hasSiegeEngineSelected(unitCounts, byType) ? 'optional' : 'none';
}

/** The buildings a fleet can be sent at: only those on the target's shore (see `isShoreBuildingHex`). */
export function shoreBuildings<T extends { q: number; r: number }>(buildings: T[], terrain: TerrainLookup): T[] {
  return buildings.filter((b) => isShoreBuildingHex({ q: b.q, r: b.r }, terrain));
}

/**
 * Builds a `support`-mission `DispatchArmyRequest` — identical shape to
 * `buildAttackDispatchRequest` (a target settlement plus optional waypoints,
 * no split-off "destination" the way `move` gets), since both missions
 * resolve their real destination server-side to the target settlement's own
 * hex (see `ArmyService.DispatchAsync`). Kept as its own function rather than
 * reusing `buildAttackDispatchRequest` under the hood so each mission's
 * request-building stays a one-line, self-contained read at the call site —
 * mirrors why `buildAttackDispatchRequest` doesn't share `buildMoveDispatchRequest`. `targetBuildingCoord` is the host's garrison
 * spot (its longhouse, a tower or a dock) the army joins; the server refuses a support without one.
 */
export function buildSupportDispatchRequest(
  from: DispatchFromSpot[],
  route: AxialCoord[],
  provisions: number,
  targetSettlementId: string | null,
  targetBuildingCoord: HexPoint | null,
): DispatchArmyRequest | null {
  if (from.length === 0 || !targetSettlementId || !targetBuildingCoord) return null;

  const waypoints = route.map((c) => ({ q: c.q, r: c.r }));
  return {
    from,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    provisions,
    mission: 'support',
    targetSettlementId,
    targetBuildingCoord: { q: targetBuildingCoord.q, r: targetBuildingCoord.r },
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

/**
 * Hexes/hour a dispatch would travel at — mirrors `ShipCargo.Pace` (`Army.TotalSpeed`): the slowest selected unit type sets
 * the pace (a catapult army crawls at catapult speed); a fleet moves at its slowest ship and its passengers do not slow it.
 * `0` for an empty selection.
 */
export function totalSpeed(
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): number {
  const selected = Object.entries(unitCounts)
    .filter(([type, count]) => count > 0 && byType[type])
    .map(([type]) => byType[type]);
  const ships = selected.filter((d) => d.class === 'ship');
  const pacing = ships.length > 0 ? ships : selected;
  return pacing.length === 0 ? 0 : Math.min(...pacing.map((d) => d.speed));
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
  if (totalSeconds <= 0) return i18n.global.t('hud.armyStatus.arriving');
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
    mission?: string;
  },
  targetSettlementName?: string | null,
): string {
  if (army.atHome) return i18n.global.t('hud.armyStatus.atHome');
  if (army.supporting) {
    return targetSettlementName
      ? i18n.global.t('hud.armyStatus.supportingNamed', { name: targetSettlementName })
      : i18n.global.t('hud.armyStatus.supporting');
  }
  if (army.movement?.isReturning) return i18n.global.t('hud.armyStatus.returning');
  if (army.mission === 'hunt') return i18n.global.t('hud.armyStatus.hunting');
  return i18n.global.t('hud.armyStatus.inTransit');
}

/**
 * The hex a land army leaves from and returns to: the building that trained its slowest unit type
 * (ties: the unit type listed first in the catalogue, which `/api/v1/units` serves in backend
 * `UnitType` enum order), the one nearest `centre` when there are several (ties by Q, then R), and
 * the centre when that building is gone or nothing is selected. Mirrors `Army.TrainingSite`.
 */
export function trainingSite(
  centre: AxialCoord,
  buildings: ReadonlyArray<{ q: number; r: number; type: string }>,
  unitCounts: Record<string, number>,
  byType: Record<string, UnitDefinitionResponse>,
): AxialCoord {
  const order = Object.keys(byType);
  let slowest: UnitDefinitionResponse | null = null;
  for (const [type, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    const definition = byType[type];
    if (!definition) continue;
    if (
      slowest === null ||
      definition.speed < slowest.speed ||
      (definition.speed === slowest.speed && order.indexOf(type) < order.indexOf(slowest.type))
    ) {
      slowest = definition;
    }
  }
  if (!slowest) return centre;

  const required = slowest.requiredBuildingType;
  const candidates = buildings
    .filter((b) => b.type === required)
    .sort((a, b) => hexDistance(a, centre) - hexDistance(b, centre) || a.q - b.q || a.r - b.r);
  return candidates.length > 0 ? { q: candidates[0].q, r: candidates[0].r } : centre;
}

/**
 * The hex a dispatch draft is aimed at, which decides the spots its units leave from (nearest first): the last clicked hex of a
 * move or founding, the camp of a hunt, the target settlement's hex (or its named garrison spot) of an attack or support.
 * `null` while the draft has no target yet.
 */
export function dispatchTargetCoord(
  draft: {
    mission: string;
    targetSettlementId: string | null;
    targetCamp: AxialCoord | null;
    targetBuildingCoord: AxialCoord | null;
    route: ReadonlyArray<AxialCoord>;
  },
  settlementCoord: (settlementId: string) => AxialCoord | undefined,
): AxialCoord | null {
  if (draft.mission === 'attack' || draft.mission === 'support') {
    if (draft.mission === 'support' && draft.targetBuildingCoord) return draft.targetBuildingCoord;
    return draft.targetSettlementId ? settlementCoord(draft.targetSettlementId) ?? null : null;
  }
  if (draft.mission === 'hunt') return draft.targetCamp;
  return draft.route.length > 0 ? draft.route[draft.route.length - 1] : null;
}

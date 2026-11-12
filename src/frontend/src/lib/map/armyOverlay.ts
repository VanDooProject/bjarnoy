import type { ForeignArmyResponse } from '../../api/types';
import { routeProgressAt } from '../units/armyProgress';
import type { ArmyOverlayMarker, ArmyOverlayMovement } from './HexMapRenderer';
import { realmColor } from './realmColours';
import type { Settlement } from './types';

/**
 * Issue #94: hands the renderer the whole frozen leg, not a position — it interpolates along it every frame (see HexMapRenderer's
 * `resolveArmyPoint`). `path` is always the *active* leg, outbound or return (the backend rebuilds Movement on turn-around), so there is
 * no leg-picking to do here. One mapping for own armies (`MovementResponse`) and the visible stretch of a foreign one (`ForeignMovementResponse`).
 */
export function armyOverlayMovement(m: {
  path: { q: number; r: number }[];
  cumulativeHours?: number[];
  edgeHours?: number[];
  departedAt: string;
  arrivesAt: string;
}): ArmyOverlayMovement {
  return {
    path: m.path.map((p) => ({ q: p.q, r: p.r })),
    cumulativeHours: m.cumulativeHours ?? [],
    edgeHours: m.edgeHours ?? [],
    departedAtMs: Date.parse(m.departedAt),
    arrivesAtMs: Date.parse(m.arrivesAt),
  };
}

/**
 * The marker of another player's army marching inside our sight (docs/design/map-fog-v2.md §1g): in its owner's realm colour (guild, treaty
 * or rival, like the realm borders; `owner` is `foreignArmyOwner`'s settlement, unknown reads as rival), never selected, and flagged `foreign` so the
 * renderer gives it no fog vision.
 */
export function foreignArmyMarker(
  army: ForeignArmyResponse,
  owner: Settlement | undefined,
  playerId: string,
): ArmyOverlayMarker {
  return {
    id: army.id,
    position: army.position,
    selected: false,
    returning: false,
    isFleet: army.isFleet,
    // A foreign army lifts none of our fog, so the radius is never read.
    visionRadius: 0,
    movement: armyOverlayMovement(army.movement),
    foreign: true,
    color: realmColor(owner, playerId),
  };
}

/**
 * The settlement whose realm colour another player's army wears: its home, or, for an army without a home, any settlement of the same
 * owner on the map (the colour is the owner's, guild, treaty or rival). Undefined when none is known, which reads as rival.
 */
export function foreignArmyOwner(
  army: ForeignArmyResponse,
  settlements: { getSettlement(id: string | null): Settlement | undefined; listSettlements(): Settlement[] },
): Settlement | undefined {
  return settlements.getSettlement(army.settlementId) ?? (army.settlementId === null
    ? settlements.listSettlements().find((s) => s.ownerId === army.ownerId)
    : undefined);
}

/**
 * A fleet on its way to set up a beach camp stops one hex short: the route's last hex is the camp's sand hex, the ships wait on the
 * water hex before it. The same leg with its last hex dropped; the fleet reaches the water hex at the schedule's own time for it
 * (a sand hex costs a fleet 2, so that is earlier than the leg's arrival). A leg of one hex or none is left as it is.
 */
export function campFleetMovement(movement: ArmyOverlayMovement): ArmyOverlayMovement {
  const n = movement.path.length;
  if (n < 2) return movement;
  const hours =
    movement.cumulativeHours.length === n && movement.cumulativeHours[0] === 0 && movement.cumulativeHours[n - 1] > 0
      ? movement.cumulativeHours
      : movement.path.map((_, i) => i);
  const fraction = hours[n - 2] / hours[n - 1];
  return {
    path: movement.path.slice(0, n - 1),
    cumulativeHours: hours.slice(0, n - 1),
    edgeHours: movement.edgeHours.length === n ? movement.edgeHours.slice(0, n - 1) : [],
    departedAtMs: movement.departedAtMs,
    arrivesAtMs: movement.departedAtMs + fraction * (movement.arrivesAtMs - movement.departedAtMs),
  };
}

/** Marker id of the land troops that stand on the camp hex while the fleet of the same army waits out on the water. */
export const campLandMarkerId = (armyId: string): string => `${armyId}:camp-land`;

/**
 * The one place an own army becomes map marker(s) for a beach camp army (`setupcamp`). A land army stands on the camp hex as any army
 * does. A fleet (ships carrying the builders and troops) is drawn on the route's second-to-last hex, the water next to the camp
 * (`campFleetMovement`); once it has arrived and the camp is being built, the troops on board stand on the camp hex as a second,
 * land marker (`campLandMarkerId`, not tappable) next to it. Any other army, or one that was recalled, is `marker` as it is.
 */
export function campArmyMarkers(
  marker: ArmyOverlayMarker,
  army: { mission: string; movement: { isReturning: boolean; arrivesAt: string; path: { q: number; r: number }[] } | null },
  now: number,
): ArmyOverlayMarker[] {
  const movement = army.movement;
  if (army.mission !== 'setupcamp' || !marker.isFleet || !marker.movement || !movement || movement.isReturning) return [marker];
  const path = movement.path;
  const fleet: ArmyOverlayMarker = { ...marker, movement: campFleetMovement(marker.movement) };
  if (path.length >= 2) fleet.position = { q: path[path.length - 2].q, r: path[path.length - 2].r };
  if (!(now >= Date.parse(movement.arrivesAt)) || path.length === 0) return [fleet];
  const site = path[path.length - 1];
  const land: ArmyOverlayMarker = {
    ...marker,
    id: campLandMarkerId(marker.id),
    position: { q: site.q, r: site.r },
    isFleet: false,
    pick: undefined,
    movement: undefined,
  };
  return [fleet, land];
}

/**
 * The hex a camp fleet's marker is on at `now` (the half of its leg it has reached): read off the same trimmed leg the marker is drawn
 * on (`campFleetMovement`), so a pan or flash on the army lands where the marker is. `army` is an outbound `setupcamp` fleet.
 */
export function campFleetLiveCoord(
  army: { position: { q: number; r: number }; movement: Parameters<typeof armyOverlayMovement>[0] },
  now: number,
): { q: number; r: number } {
  const leg = campFleetMovement(armyOverlayMovement(army.movement));
  const progress = routeProgressAt(leg.path, leg.cumulativeHours, leg.edgeHours, leg.departedAtMs, leg.arrivesAtMs, now);
  if (!progress) return army.position;
  return progress.arrived || progress.t >= 0.5 ? progress.to : progress.from;
}

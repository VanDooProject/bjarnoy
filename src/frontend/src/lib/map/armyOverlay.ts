import type { ForeignArmyResponse } from '../../api/types';
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
 * or rival, like the realm borders; `owner` is that army's settlement, unknown reads as rival), never selected, and flagged `foreign` so the
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

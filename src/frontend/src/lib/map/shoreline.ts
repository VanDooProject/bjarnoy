// Issue #40 phase 6 §4: a client-side mirror of the backend's
// `Bjarnoy.Domain.World.Shoreline.IsShoreline`, so TrainingModal.vue can grey
// out Karve/Longship at a non-coastal settlement the same way it already
// greys out a unit whose longhouse level isn't high enough yet, instead of
// only finding out from the backend's `SettlementNotCoastal` rejection after
// clicking Train.
//
// This is safe to compute here rather than needing a new backend flag/call:
// terrain is generated deterministically from the world's seed
// (`worldGenerator.ts`), and `stores/world.ts` reseeds the local `WorldModel`
// from that same seed on load (see its `WorldModel(world.seed)` call) — so
// `WorldModel.isLand` already agrees with the backend's `TerrainSampler` for
// every hex, live mode included, with no extra round trip.
import { hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';

/** The subset of `WorldModel` this needs — narrowed so tests can pass a plain object instead of a full model. */
export interface TerrainLookup {
  isLand(q: number, r: number): boolean;
}

/**
 * True when `center`'s claimed territory (every hex within `claimRadius`)
 * includes at least one shoreline hex — land with a sea neighbour. Mirrors
 * `SettlementService.cs`'s `settled.Centre.WithinRadius(settled.ClaimRadius).Any(sampler.IsShoreline)`,
 * the `hasShoreline` flag `Settlement.PlanTrain` gates Ship-class training on.
 */
export function hasShoreline(center: AxialCoord, claimRadius: number, terrain: TerrainLookup): boolean {
  for (const hex of hexesInRadius(center, claimRadius)) {
    if (!terrain.isLand(hex.q, hex.r)) continue;
    if (neighbors(hex).some((n) => !terrain.isLand(n.q, n.r))) return true;
  }
  return false;
}

/**
 * Mirrors `Settlement.cs`'s `ClaimRadius => 1 + (LonghouseLevel / 2)` — the
 * claimed-territory radius `hasShoreline` needs derives purely from the
 * longhouse level the frontend already tracks (`hud.level`), so no extra
 * wire field (`SettlementResponse.claimRadius`, fetched but otherwise unused
 * by anything client-side) needs plumbing through just for this.
 */
export function claimRadiusForLevel(longhouseLevel: number): number {
  return 1 + Math.floor(longhouseLevel / 2);
}

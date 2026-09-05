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
 * Mirrors `Settlement.cs`'s `ClaimRadius` (backed by
 * `BuildingCatalogue`'s Longhouse `ClaimRadius = 2 + (level / 2)`, the same
 * number `building-catalogue.json`'s `longhouse` entries carry in their own
 * `claimRadius` field) — the centre disc's own radius, derived purely from
 * the longhouse level the frontend already tracks (`hud.level`), so no
 * extra wire field (`SettlementResponse.claimRadius`, fetched but otherwise
 * unused by anything client-side) needs plumbing through just for this.
 * This is only the centre disc — see `claimDiscs` for the settlement's full
 * claimed territory once Tower satellite discs are included.
 */
export function claimRadiusForLevel(longhouseLevel: number): number {
  return 2 + Math.floor(longhouseLevel / 2);
}

/**
 * Mirrors `Settlement.cs`'s `TowerClaimRadius(int towerLevel)` (backed by
 * `BuildingCatalogue`'s Tower `ClaimRadius = level / 2`, the same number
 * `building-catalogue.json`'s `tower` entries carry in their own
 * `claimRadius` field) — half the growth rate of `claimRadiusForLevel`, with
 * no "+1" floor (a Tower only ever extends ground the settlement's centre
 * disc already reaches; see that backend method's own remarks for why).
 */
export function towerClaimRadiusForLevel(towerLevel: number): number {
  return Math.floor(Math.max(0, towerLevel) / 2);
}

/** One disc of a settlement's claimed territory — see `claimDiscs`. */
export interface ClaimDisc {
  q: number;
  r: number;
  radius: number;
}

/**
 * Mirrors `Settlement.ClaimDiscs`: every disc that makes up a settlement's
 * full claimed territory — the centre disc first, then one satellite disc
 * per placed Tower, centred on that tower's own hex rather than `center`.
 * `towers` only needs `PlacedBuildingResponse` entries already filtered (or
 * not — any non-Tower type is harmless here, callers just shouldn't bother)
 * to `type === 'tower'`; only `q`/`r`/`level` are read.
 */
export function claimDiscs(
  center: AxialCoord,
  longhouseLevel: number,
  towers: Array<{ q: number; r: number; level: number }>,
): ClaimDisc[] {
  return [
    { q: center.q, r: center.r, radius: claimRadiusForLevel(longhouseLevel) },
    ...towers.map((t) => ({ q: t.q, r: t.r, radius: towerClaimRadiusForLevel(t.level) })),
  ];
}

/**
 * `hasShoreline`, unioned across every disc of a settlement's full claimed
 * territory (see `claimDiscs`) — true when *any* disc reaches a shoreline
 * hex, not just the centre disc. This is what a real coastal-training check
 * needs: a settlement inland at its centre but with a Tower on the coast is
 * exactly the case the multi-disc territory mechanic exists to enable.
 */
export function hasShorelineInTerritory(discs: ClaimDisc[], terrain: TerrainLookup): boolean {
  return discs.some((disc) => hasShoreline({ q: disc.q, r: disc.r }, disc.radius, terrain));
}

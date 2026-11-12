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
import { coordKey, hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';
import { claimsWithGiants } from './territory';

/** The subset of `WorldModel` this needs — narrowed so tests can pass a plain object instead of a full model. */
export interface TerrainLookup {
  isLand(q: number, r: number): boolean;
  /** The open sea: neither land nor water an island encloses (a bog lake, an inland lake). */
  isSea(q: number, r: number): boolean;
}

/**
 * True when `center`'s claimed territory (every hex within `claimRadius`)
 * includes at least one shoreline hex — land with a sea neighbour (an inland lake or a bog lake is not sea). Mirrors
 * `SettlementService.cs`'s `settled.Centre.WithinRadius(settled.ClaimRadius).Any(sampler.IsShoreline)`,
 * the `hasShoreline` flag `Settlement.PlanTrain` gates Ship-class training on.
 */
export function hasShoreline(center: AxialCoord, claimRadius: number, terrain: TerrainLookup): boolean {
  for (const hex of hexesInRadius(center, claimRadius)) {
    if (!terrain.isLand(hex.q, hex.r)) continue;
    if (neighbors(hex).some((n) => terrain.isSea(n.q, n.r))) return true;
  }
  return false;
}

/**
 * Mirrors the backend's rule for where a fleet may be sent (`Army.PlanDispatch`'s fleet Attack/Raid gate): a building
 * hex is on the shore when it is a sea hex (the coastal-water buildings: Dockyard, Fishing Hut, Shrine of Njörd; a building on an inland lake is not) or a
 * shoreline land hex. The claim check is not mirrored: the buildings a caller offers already belong to the target.
 */
export function isShoreBuildingHex(coord: AxialCoord, terrain: TerrainLookup): boolean {
  return terrain.isSea(coord.q, coord.r) || hasShoreline(coord, 0, terrain);
}

/**
 * Mirrors `Settlement.cs`'s `ClaimRadius` (backed by
 * `BuildingCatalogue`'s Longhouse `ClaimRadius = level == 1 ? 2 : 3`, the same
 * number `building-catalogue.json`'s `longhouse` entries carry in their own
 * `claimRadius` field) — the centre disc's own radius, derived purely from
 * the longhouse level the frontend already tracks (`hud.level`), so no
 * extra wire field (`SettlementResponse.claimRadius`, fetched but otherwise
 * unused by anything client-side) needs plumbing through just for this.
 * This is only the centre disc — see `claimDiscs` for the settlement's full
 * claimed territory once Tower satellite discs are included.
 */
export function claimRadiusForLevel(longhouseLevel: number): number {
  // The Longhouse only grows the realm until towers are available: 2 at
  // level 1, 3 from level 2 on, and it stops there — territory then grows
  // through towers (docs/design/economy.md section 5).
  return longhouseLevel <= 1 ? 2 : 3;
}

/**
 * Mirrors `Settlement.LonghouseDisc`: the settlement's Longhouse (centre) claim disc — as a list so callers spread it —
 * or no disc at all when its Longhouse is destroyed (level 0): such a settlement has no claim, not even its centre hex.
 * The one place the client decides this (`centreClaimDiscs`, which `claimDiscs` and `resolveRealm` read, builds on it).
 */
export function longhouseDiscs(center: AxialCoord, longhouseLevel: number): ClaimDisc[] {
  return longhouseLevel <= 0 ? [] : [{ q: center.q, r: center.r, radius: claimRadiusForLevel(longhouseLevel) }];
}

/**
 * Mirrors `Settlement.CentreDisc`: the claim disc of a settlement's centre — for a beach camp (`isBeachCamp`) always its own hex
 * only (radius 0, fixed), otherwise the Longhouse's (`longhouseDiscs`). The one place the client reads a centre claim
 * (`claimDiscs`, `resolveRealm` and the model's border radius all go through it).
 */
export function centreClaimDiscs(center: AxialCoord, longhouseLevel: number, isBeachCamp: boolean): ClaimDisc[] {
  return isBeachCamp ? [{ q: center.q, r: center.r, radius: 0 }] : longhouseDiscs(center, longhouseLevel);
}

/**
 * Mirrors `FogVisionRadii.ToVisionSource`'s centre: the sight disc of a settlement's centre. A beach camp (`isBeachCamp`) sees
 * like a level-1 Longhouse, fixed (it has no Longhouse level of its own); otherwise the Longhouse's own disc (`longhouseDiscs`).
 */
export function centreVisionDiscs(center: AxialCoord, longhouseLevel: number, isBeachCamp: boolean): ClaimDisc[] {
  return longhouseDiscs(center, isBeachCamp ? 1 : longhouseLevel);
}

/**
 * Mirrors `Settlement.cs`'s `TowerClaimRadius(int towerLevel)` (backed by
 * `BuildingCatalogue`'s Tower `ClaimRadius = level`, the same number
 * `building-catalogue.json`'s `tower` entries carry in their own
 * `claimRadius` field) — one hex of reach per tower level, starting at
 * level 1, with no "+1" floor (a Tower only ever extends ground the
 * settlement's centre disc already reaches; see that backend method's own
 * remarks for why).
 */
export function towerClaimRadiusForLevel(towerLevel: number): number {
  return Math.max(0, towerLevel);
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
  isBeachCamp = false,
): ClaimDisc[] {
  return [
    ...centreClaimDiscs(center, longhouseLevel, isBeachCamp),
    ...towers.map((t) => ({ q: t.q, r: t.r, radius: towerClaimRadiusForLevel(t.level) })),
  ];
}

/**
 * `hasShoreline`, unioned across every disc of a settlement's full claimed
 * territory (see `claimDiscs`) — true when *any* disc reaches a shoreline
 * hex, not just the centre disc. This is what a real coastal-training check
 * needs: a settlement inland at its centre but with a Tower on the coast is
 * exactly the case the multi-disc territory mechanic exists to enable.
 *
 * Every candidate hex is filtered through `claimsWithGiants` before the
 * shoreline check, not just unioned by raw disc membership — mirrors
 * `SettlementService.PlanTrainAsync`'s own giant-aware rewrite: a hex that
 * only geometrically overlaps a disc but isn't actually claimed (it belongs
 * to a giant whose 7-hex footprint isn't fully covered by the disc union)
 * must not count as this settlement's shoreline either. `giantAt` defaults
 * to "no giants" for callers with no giant data on hand (matches
 * `GiantIndex.Empty`'s role backend-side).
 */
export function hasShorelineInTerritory(
  discs: ClaimDisc[],
  terrain: TerrainLookup,
  giantAt: (coord: AxialCoord) => AxialCoord | null = () => null,
): boolean {
  const seen = new Set<string>();
  for (const disc of discs) {
    for (const hex of hexesInRadius({ q: disc.q, r: disc.r }, disc.radius)) {
      const key = coordKey(hex);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!claimsWithGiants(discs, hex, giantAt)) continue;
      // `hasShoreline` with radius 0 checks exactly this one hex: land with
      // at least one sea neighbour — reused rather than re-inlined so this
      // stays the one place that predicate lives.
      if (hasShoreline(hex, 0, terrain)) return true;
    }
  }
  return false;
}

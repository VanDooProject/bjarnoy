# Troop movement: range, and moving troops that already arrived

Tracked by [#156](https://github.com/VanDooProject/bjarnoy/issues/156). Background:
[#40](https://github.com/VanDooProject/bjarnoy/issues/40) §4 (the original troop
build & movement design, delivered by [#58](https://github.com/VanDooProject/bjarnoy/pull/58))
and the "troop movement" bullet in [#91](https://github.com/VanDooProject/bjarnoy/issues/91).

This document exists because the #40 design doc itself was never committed to the
repository — until now the food-range rule lived only in code comments and a closed
issue.

## 1. The range restriction is food, not distance

There is no hex-radius cap on troop movement anywhere in the code. The restriction
is **provisions**:

> Rejected unless provisions cover the whole round trip (outbound + precomputed
> return) at the army's upkeep rate.

Where it lives:

- `Army.PlanDispatch` (`src/backend/src/Bjarnoy.Domain/Armies/Army.cs`) validates it
  and rejects with `DispatchRejection.InsufficientProvisionsForRoundTrip`.
- `Movement.Create` (`src/backend/src/Bjarnoy.Domain/Movement/Movement.cs`) derives
  `TurnAroundAt` — the instant the remaining food exactly covers the way home — and
  `Army.SettleTo` turns the army around there, unprompted.
- `ArmyMission.Support` is the one exception today: one-way plus
  `Army.SupportReserveHours` (2h), because the host feeds a guest from arrival.

So "range" means *how far an army can go and still get back*. Everything below keeps
that rule rather than inventing a second one.

## 2. The gap

An army that has reached its destination is `ArmyLocation.InTransit` with
`IsReturning == false`, `now >= Movement.ArrivesAt` and `now < Movement.TurnAroundAt`.
It stands there burning provisions until it turns itself around, and the only order a
player can give it is **Recall**:

| Layer | State before this work |
|---|---|
| Domain | `PlanDispatch` (from home only), `Recall` (→ home), `SettleTo` (auto-return), plus the admin-only `TeleportTo`/`ShiftArrivalTo`. |
| API | dispatch / get / list / guests / recall. No onward-move endpoint. |
| Frontend | `components/hud/ArmyPanel.vue` renders one action per army row: Recall. |

Admins can already reposition an army through `PATCH /api/v1/admin/armies/{id}`;
players cannot.

## 3. Rules for a field order

| Situation | Allowed | Gate |
|---|---|---|
| At home | ordinary dispatch (unchanged) | free; waypoints free |
| Standing on its destination hex | **Move on** to a new destination | free; waypoints **premium** |
| In transit, outbound | **Append goal** — the current destination becomes a waypoint, the march continues | **premium** |
| Returning home | nothing | — |
| Supporting (guest) | Recall only | — |
| Any field order | must pass the round-trip food check from where it stands | always |

A movement always finishes: an in-flight order may only *extend* the route, never
divert it. That makes **append** the same operation as **move on** with the current
destination auto-prepended as a waypoint — one domain method, one endpoint.

The food check uses `ProvisionsAt(now)` (what is left after the burn so far), not the
figure loaded at departure, and the rebuilt `Movement` recomputes `TurnAroundAt` from
the remainder. Provisions only ever decrease, so chained hops cannot be gamed: an army
may walk outward indefinitely as long as it can still afford the way home.

Attack/Raid orders from the field are in scope and reuse `PlanDispatch`'s existing
target-settlement, shoreline and catapult-building validation. Attacking *other armies*
in the open field is not — it needs a target type, army-vs-army resolution and
interception semantics of its own.

## 4. Guests must be able to walk home

Support dispatch validates one-way plus a 2h reserve, not the round trip. A guest does
not burn its own provisions while hosted (`Settlement.SettleTo` feeds it;
`Army.ProvisionsAt` returns the raw field for `Supporting`), so at `Recall` it still
holds roughly that reserve and then walks home on an empty stomach. `ProvisionsAt`
floors at zero and there is no in-field starvation model yet, so today it survives by
accident — the moment starvation lands, every recalled guest dies.

Support therefore takes the same round-trip check as every other mission. The
consequence is deliberate: support dispatches roughly double in food, and long-range
support may start hitting `ProvisionsExceedCarryCapacity`, i.e. it needs provisioners
along.

## 5. Rivers

`HexPathfinder` knows only `Terrain` (sea/sand/grass/forest/mountain). Rivers are a
separate, persisted per-island dataset (`RiverGenerator` → `IslandEntity.RiverTiles`,
tile-based with in/out directions) and are invisible to pathfinding. Making them
impassable to land units means injecting a river predicate alongside `terrainAt` and
having `ArmyService` load the island's tiles.

This changes existing worlds: a river cutting an island in two makes routes
unreachable that were fine before, and can strand already-dispatched armies. Settlement
founding and claim logic need reviewing at the same time. River *navigation* for ships
is separate work.

## 6. Showing the range on the map

A distance circle would lie — the tint has to honour terrain cost and rivers. The
client already has both: terrain is generated procedurally (`lib/map/worldGenerator.ts`,
mirroring the backend `TerrainSampler`) and river tiles arrive from the backend
(`WorldModel.setRiverTiles`).

The right algorithm is not A* per hex but **two Dijkstra flood-fills** — hours-from-army
and hours-from-home — tinting every hex where the sum is within the hours of food
remaining. The food radius bounds the fill, so it terminates naturally.

The hazard is two copies of the terrain cost table (C# and TypeScript) drifting apart
and the tint quietly disagreeing with the server. The costs should be served from the
backend, with a golden fixture shared between both test suites.

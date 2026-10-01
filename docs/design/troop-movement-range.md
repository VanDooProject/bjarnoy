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
- `ArmyMission.Support` used to be a one-way-plus-reserve exception, because
  the host feeds a guest from arrival — but a recalled guest still walks home
  on its own provisions with nobody feeding it, so it now takes the same
  round-trip check as everything else (§4).

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

## 4. Guests must be able to walk home (implemented)

Support dispatch used to validate one-way plus a 2h reserve, not the round trip. A
guest does not burn its own provisions while hosted (`Settlement.SettleTo` feeds it;
`Army.ProvisionsAt` returns the raw field for `Supporting`), so at `Recall` it still
held roughly that reserve and then walked home on an empty stomach. `ProvisionsAt`
floors at zero and there is no in-field starvation model yet, so it survived by
accident — the moment starvation lands, every recalled guest would have died.

Support now takes the same round-trip check as every other mission
(`Army.PlanDispatch`). The consequence is deliberate: support dispatches roughly
double in food, and long-range support may start hitting
`ProvisionsExceedCarryCapacity`, i.e. it needs provisioners along.

## 5. Rivers and mountains (implemented)

`HexPathfinder` knows `Terrain` (sea/sand/grass/forest/mountain/bog/lake) plus two
predicates the caller injects: `isRiver` and `isWideRiver`. Rivers are a separate,
persisted per-island dataset (`RiverGenerator` -> `IslandEntity.RiverTiles`, tile-based
with in/out directions); `WorldRivers.IndexAsync` loads them into a `RiverIndex`, which
is what `ArmyService` and `FieldBattleService` pass in (`RiverIndex.IsRiver`/`IsWide`).

The rules for **land armies** (fleets are unchanged):

| Hex | Land army |
| --- | --- |
| Sea, lake | impassable |
| Mountain | **impassable** |
| Wide river | **impassable** |
| Stream (any river tile that is not wide) | walkable at a **flat `1.0 + RiverCrossingCost` (= 9)** over *any* land terrain, mountains included |
| Anything else | its terrain cost (grass 1.0, sand 1.1, forest 1.3, bog 2.0) |

A river tile is **wide** when at least two of its arms are river width
(`RiverGenerator.IsWideRiver`, mirrored by `isWideRiverTile` in `riverGenerator.ts`): a
`river` run and a `riverstream` Y (a stream joining a river) are wide; a stream run, a
`widen` tile and a stream-stream confluence are streams. A stream is charged on entry
only (never on exit), so stopping and restarting a march mid-stream never pays it twice.
Because the flat cost replaces the terrain cost, every step still costs at least 1.0 and
the A* heuristic (plain hex distance) stays admissible.

Consequences:

- **A route can be impossible.** A target behind a mountain ring or a wide river has no
  land route; `FindPath` returns `null`. Valley streams (`river-generation.md`) exist so
  that every mountain-enclosed valley of 100+ hexes still has a walkable way out.
- **Refused, not planned.** A dispatch, field order or founding retarget with no route is
  refused with a 409 (`DispatchRejection.UnreachableLeg`, `FieldOrderRejection.UnreachableLeg`,
  `RetargetFoundingRejection.TargetNotReachable`) and the message "No land route: mountains
  and wide rivers can't be crossed."; the client maps the same codes to `apiErrors.rejections`
  in every locale and shows the text in the dispatch draft.
- **Armies already marching keep their stored paths.** Nothing re-routes them; the rules
  only apply to routes planned from now on (a recall or retreat from where an army stands
  is planned afresh, so an army standing on a mountain can still leave it).
- `FindPath` also takes the palisade hooks (default `null`, nothing blocked): `blocked`
  (every standing wall hex), `friendlyGate` (a gate of the army's own owner) and `halfOpen`
  (a wall's land end, charged `HalfOpenEndCost` = 3). The rules apply in this order: wide
  river and mountain impassable, stream flat 9, half-open end 3, blocked unless a friendly
  gate, terrain cost. `PalisadeIndex` (loaded per world like the rivers) and
  `palisadeRestrictions` (`lib/map/palisadeMovement.ts`) build them; `docs/design/economy.md`
  section 5 has the wall rules.

Settlement founding and claim logic are not affected: they never path.

## 6. Showing the range on the map

A distance circle would lie — the tint has to honour terrain cost, rivers and the
impassable mountains and wide rivers of section 5 (`gamePathContext` in `lib/map/movementContext.ts`
builds the same rules `HexPathfinder` uses). The
client already has both: terrain is generated procedurally (`lib/map/worldGenerator.ts`,
mirroring the backend `TerrainSampler`) and river tiles arrive from the backend
(`WorldModel.setRiverTiles`).

The right algorithm is not A* per hex but **two Dijkstra flood-fills** — hours-from-army
and hours-from-home — tinting every hex where the sum is within the hours of food
remaining. The food radius bounds the fill, so it terminates naturally.

The hazard is two copies of the terrain cost table (C# and TypeScript) drifting apart
and the tint quietly disagreeing with the server. The costs should be served from the
backend, with a golden fixture shared between both test suites
(`src/shared/river-pathing-golden.json`, generated by `scripts/regen-goldens/river-pathing-golden.ts`;
it covers a wide river and a mountain stopping an army, a stream on a mountain costing 9, and walls: a gate for its owner and for an enemy, a half-open end at 3 and a sealed end).

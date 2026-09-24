# AI players

AI-controlled "jarls" that take over settlements whose anonymous owner never
registered and has stopped playing. They keep building and defending the
settlement the way a player would. Related: #125 (NPC settlements), #108
(anonymous → registered accounts).

## Takeover rule

A settlement is taken over when **both** of these hold:

1. **No registration.** Its owner never went through "create jarl"
   (registering an account, which will include an email once that exists).
   Concretely, `SettlementEntity.UserId == SystemUserIds.Abandoned`. A
   registered account's settlements are never taken over.
2. **Abandoned for long enough.** `SettlementEntity.LastOwnerActivityAt`
   (wall clock) is older than `AiPlayers:TakeoverAfter` (default 7 days).
   The column is set at founding. It is bumped by the anonymous-owner branch
   of the ownership gate (`OwnershipGate.EnforceAsync`) every time the owner
   issues an accepted mutating request, throttled to one write per
   `AiPlayers:ActivityWriteThrottle`.

Takeover is **final**. The settlement moves to a newly created AI account
(`UserEntity.IsSystem = true`, Norse display name). Its `OwnerId` is
rewritten to `ai:{userId}`, so the old browser-local id no longer passes the
ownership gate. If the original player comes back, they found a new
settlement.

Each takeover creates its own AI account, so every AI shows up as a separate
jarl on leaderboards and the map. Personalities are dealt out by
`AiPlayers:PersonalityWeights`.

## Personalities

A personality is only a **profile**: a set of weights and thresholds the
planner reads. It is not a separate code path.

| Personality | Leans towards | Garrison target (per longhouse level) | Attacks |
| --- | --- | --- | --- |
| `Economic` | producers, storage, shrines, longhouse | low | never |
| `Balanced` | even split | medium | rarely, only with a clear edge |
| `Defensive` | towers, spearmen/bowmen, storage | high | never |
| `Aggressive` | barracks, iron, axemen/berserkers | medium, with a large field army on top | raids when stronger |

To add a personality, add one more `AiProfile` entry in `AiProfiles`.

## Objectives

Every AI player has an ordered list of objectives. Personalities come with
defaults. Admins can replace them through the admin API. An open objective
raises the priority of the actions that serve it, so an Economic AI told to
reach `GarrisonStrength 40` still trains troops.

- `ReachLonghouseLevel(level)`
- `ReachBuildingLevel(type, level)`: the highest building of that type
- `ProductionRate(resource, perHour)`
- `GarrisonStrength(units)`: total units at home

An objective is met when the settlement satisfies it. Met objectives are
recorded but otherwise ignored.

## Planner (pure domain, `Bjarnoy.Domain/Ai`)

`AiPlanner.Plan(AiSnapshot) → IReadOnlyList<AiAction>` is deterministic for
a given snapshot and seed, so it is unit-tested without a database.

The snapshot contains:

- the settled `Settlement`
- the game `now` and speed factor
- a per-hex description of every claimed hex: terrain, coastal water, river
  shape
- the profile and the open objectives
- attackable neighbours, each with an estimated defence

Each tick, in order:

1. **Stay fed.** If food production minus garrison upkeep is below a small
   margin, a food producer gets top priority.
2. **Build.** While a construction slot is free, the planner scores every
   (building type, hex) candidate. Upgrades of standing buildings and new
   placements both count. It keeps only candidates that the real
   `Settlement.PlanBuild` accepts: terrain, prerequisites, slots and
   affordability. The score is the personality weight for the building's
   role, plus objective boosts, plus a bonus for the scarcest resource
   (lowest rate relative to use) and for storage when a stock is near its
   cap. The best candidate becomes a `Build` intent.
3. **Train.** If the garrison is below target, train the best affordable
   unit the profile prefers, in a batch sized to what stock allows.
4. **Attack** (Aggressive, and Balanced with a large margin). If no army of
   this settlement is already out, pick the weakest neighbour whose
   estimated defence is below `attack × margin`. Send a `Raid` with the
   offensive units, keeping the defensive garrison home.

**Targeting in v1:** only settlements owned by other AI players count as
neighbours. AIs never attack human players, registered or anonymous.
Planned later: attacks that mainly target *stronger* players, and a
"guardian" objective that protects particular islands. The executor applies
this through one filter, `AiTargetPolicy`.

## Execution (infrastructure)

`AiPlayerService.RunDueAsync` is driven by `AiPlayersHostedService`, which
polls every 60 s, the same loop shape as `WeeklyAggregationHostedService`.
For each AI player whose `NextActAt` has passed, and whose world is running,
it does the following:

- builds the snapshot
- runs the planner
- carries out each intent through **the same service methods players use**:
  `SettlementService.QueueBuildAsync`, `TrainUnitsAsync` and
  `ArmyService.DispatchAsync`

A rejected intent is logged and skipped. AI players get no resource grants,
no instant builds and no special rules.

`NextActAt` is set to `now + AiPlayers:ActInterval / world.SpeedFactor`, plus
jitter so AIs don't all act at once.

The takeover sweep (`AiTakeoverService.RunAsync`) runs in the same hosted
loop, at most once per `AiPlayers:TakeoverSweepInterval`.

## Configuration (`AiPlayers` section)

| Key | Default | Meaning |
| --- | --- | --- |
| `Enabled` | `true` | Master switch for the sweep and the runner |
| `TakeoverAfter` | `7.00:00:00` | Inactivity before an anonymous settlement is taken over |
| `TakeoverSweepInterval` | `00:10:00` | How often the takeover sweep runs |
| `ActInterval` | `00:05:00` | Base time between one AI's turns, divided by world speed |
| `ActivityWriteThrottle` | `00:05:00` | Minimum gap between `LastOwnerActivityAt` writes |
| `PersonalityWeights` | 1 each | Relative odds of each personality at takeover |

## API

- Settlement and profile contracts gain `isAi` and `aiPersonality`. The
  frontend shows an "AI" badge next to the owner.
- Admin endpoints (policy `Admin`):
  - `GET /api/v1/admin/ai-players`
  - `POST /api/v1/admin/settlements/{id}/ai`: take over now, optional
    personality
  - `PUT /api/v1/admin/ai-players/{userId}`: set personality and objectives

## Out of scope (follow-ups)

- AI founding more settlements (settler crews, founding convoys)
- AI attacking human players (stronger players first) and island-guardian
  objectives
- AI trading, guilds and chat
- Taking over registered accounts that never verified their email, once
  email exists. This would be one more predicate in the takeover query.

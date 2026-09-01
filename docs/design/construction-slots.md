# Construction slots, multi-slot buildings, and the premium build queue

**Issue:** [#158](https://github.com/VanDooProject/bjarnoy/issues/158) (from [#91](https://github.com/VanDooProject/bjarnoy/issues/91))
**Status:** implemented — domain, persistence, API, service, frontend.

## Why

Before this issue, `Settlement.MaxQueueLength` was a flat constant (3), every queued order ran in parallel
with every other, and every order cost the same one "slot". `BuildQueuePanel.vue` invented its own
`TOTAL_SLOTS = 3` with a comment saying no backend concept existed — `docs/codebase-gap-analysis.md` flagged
this as a fabricated number to close.

The outcome: parallel construction capacity is a real longhouse reward, a longhouse upgrade is a genuine
trade-off (it stops everything else), and premium players get a waiting queue whose costs are earmarked but
still physically sitting in the barn — raidable, and still counting against the storage cap, so the queue
can't be used as a raid-proof vault.

## The slot formula

```
Settlement.ConstructionSlots = 2 + max(0, (longhouseLevel − 5) / 5)
```

2 slots at longhouse level 1–9, 3 at level 10, 4 at level 15, 5 at level 20 — the formula deliberately
outlives today's `BuildingCatalogue.MaxLevel` of 10. A razed settlement (`LonghouseLevel == 0`) still reports
2 slots — harmless, since every building needs `RequiredLonghouseLevel >= 1` and nothing can be queued on a
razed settlement anyway.

## Two order states, one `Queue`

A `BuildOrder` is either **building** (in progress) or **waiting** (queued behind a full set of slots — the
premium tier). `BuildOrder.IsWaiting => StartedAt is null`.

| | **building** | **waiting** |
| --- | --- | --- |
| Cost | paid immediately, deducted from the stock | reserved — still sitting in `Resources.Stock` |
| Storage | freed — the deduction makes real headroom | still occupied, still under the cap |
| Raidable | no (already gone) | yes — see "raids" below |
| Spendable on anything else | n/a | **no** — see "reservations are settlement-wide" below |
| On the hex | level-0 stub in `Buildings` | nothing |
| Slots | occupies `SlotCost` (all of them, for a Longhouse) | occupies none |
| Can be dropped | only by catapults / realm loss / an admin edit | yes, by a raid taking the stock below the reservations |

A waiting order is promoted to *building* the instant a slot frees — `Settlement.PromoteWaitingOrders`, the
one place that happens. It is called from every path that can free a slot: `SettleTo` (after each
completion), `CancelBuild` (cancelling a building order), and `WithQueuesDueAt` (admin instant build — which
additionally bypasses the slot gate entirely, since it's a bypass, not a new plan).

Everything stays lazy and clock-settled: `SettleTo(now)` replays completions **and** promotions in
chronological order (`complete → promote → starvation`, in that order, at every instant), so reading a
settlement at time T gives the same answer whether nobody looked for a week or polled every second. A
promotion alone (no completion) still reports `SettleResult.Changed: true`, since it spends resources and
stamps `StartedAt` — losing that write would make the next read recompute a different answer, breaking the
determinism the whole lazy model rests on.

## Multi-slot buildings

`BuildingDefinition.SlotCost` (default 1) and `BuildingDefinition.OccupiesAllSlots`. The Longhouse sets
`OccupiesAllSlots = true`: its effective cost is `settlement.ConstructionSlots`, not a fixed number, so a
Longhouse upgrade can only start with **every** slot free, and blocks everything queued behind it while it
runs — the issue's original request ("longhouse upgrades should block all other construction"), for free
from the same mechanism that gives multi-slot buildings their cost.

## Reserved resources are settlement-wide, not construction-only

A reservation earmarked for the waiting queue must be unspendable on **everything** — training troops, army
dispatch provisions, posting or accepting a trade offer, a guild fee — or it is not a reservation. Every one
of those spend paths reads `Settlement.AvailableResources(now)` (`Resources.At(now) - ReservedResources`,
floored at zero) via two helpers rather than reaching into `Resources` directly:

- `Settlement.CanAffordAvailable(cost, now)`
- `Settlement.TrySpendAvailable(cost, now, out pool)`

`ResourcePool` itself stays reservation-unaware — it has no idea a queue exists. `Settlement` is the only
type that can answer "available".

Deliberately **not** gated: a raid's loot (taking reserved resources is the entire point — see below), an
admin's direct `Adjust` (god mode; `DropUnfundedOrders` handles the fallout), and every `Deposit` path.

## Raids prune the waiting tail

A raid reaches into the defender's raw stock, reserved resources included — that's the whole point of a
raid. If the stock drops below what the waiting queue has earmarked, `Settlement.DropUnfundedOrders(now)`
walks the waiting queue in order, accumulating each order's reserved cost against the settled stock; at the
first order the stock can no longer cover, it drops that order **and every order behind it**, at the raid's
own instant (`Army.cs`'s defender-resolution path). No refund — the resources were never deducted for a
waiting order; the raider simply took them. Ordinary settling (`SettleTo`) re-checks this on every settle
too, in case some other path let the stock decay below the reservations between reads.

## A removed building takes its build order with it

Removing a building from `Buildings` — a catapult destroying it outright, an admin razing it, an admin
setting its level or placing a different building on the same hex — now always drops any build order still
targeting that hex too (no refund; same rule as a raid-dropped waiting order). Without this, `SettleTo`'s
completion pass would find nothing standing at that hex and silently add the finished building back,
undoing the removal. A catapult strike that merely *reduces* a level (the target survives) leaves any
pending order alone — only outright removal drops it.

## Stacked levels per hex — built, gated off

Queueing successive levels of one building (Farm → 2 *and* Farm → 3 together) is the classic use of a build
queue in this genre, but it is not part of premium — it's meant to be its own, more expensive tier later. The
*capability* is expensive to retrofit (a second migration, a second domain pass), so it was built now and
shipped switched off:

- `Settlement.PlanBuild` takes a `maxOrdersPerHex` parameter; `Settlement.DefaultMaxOrdersPerHex = 1` is what
  every call site passes today, so observable behaviour is exactly what it always was — a second order on an
  occupied hex is refused `AlreadyQueuedOnHex`.
- The target level is computed as *the level after everything already queued on that hex*, not the standing
  level, so a chain stays contiguous by construction.
- A hex's *n*-th queued order can only ever become "building" once every earlier order on that same hex has
  finished — slots alone are not enough, or two levels of the same hex could be under construction at once
  and completion order would stop being deterministic.
- The exact line that turns the tier on later: `SettlementService.QueueBuildAsync`'s
  `maxOrdersPerHex: Settlement.DefaultMaxOrdersPerHex` argument, plus whatever entitlement lookup the tier
  gets.
- The `build_orders` unique index is `(SettlementId, Q, R, TargetLevel)`, not just `(SettlementId, Q, R)` —
  the schema change for this tier, done once, now, while it still refuses exact duplicates (the
  concurrent-double-queue race on one hex).

## API contract

- `ResourcesResponse` gains `reserved`/`available` — they live on the resources contract, not a
  construction-only one, because they're a settlement-wide economic fact every spending panel has to respect.
- `SettlementResponse` gains `construction: { slots, slotsUsed, maxWaitingOrders, waitingOrders,
  maxOrdersPerHex }`. `maxWaitingOrders === 0` is how the client learns the queue is premium-locked — no
  separate premium flag needed. `maxOrdersPerHex` is the same trick for the stacking tier above.
- `BuildOrderResponse` gains `state` (`"building"` / `"waiting"`) and `slotCost`; `completesAtGameTime` is
  `null` for a waiting order (it hasn't started, so there's no real completion instant yet — `totalSeconds`
  is an estimate in that case, since the real duration is only fixed at promotion).
- `BuildingDefinitionResponse` gains `slotCost`/`occupiesAllSlots`.
- `Describe(BuildRejection)` covers the new `NoFreeSlot` ("Every construction slot is busy" + a premium
  hint), and every `NotEnoughResources` text (build/train/trade/dispatch/guild-fee) gained a "may be reserved
  for queued construction" clause. `QueueBuild`'s 409 now also sets `ProblemDetails.Extensions["rejection"]`,
  matching the pattern founding's rejection already used — the frontend needs the machine-readable field to
  branch on `NoFreeSlot` without parsing `Detail` text.

## Frontend

`stores/world.ts`'s `hud.reserved`/`hud.available`/`hud.construction` are filled from the settlement response
alongside `hud.queue`. `hud.available` is *derived live* in `syncHud()` from `hud.resources - hud.reserved`
rather than cached — `resources` keeps accruing locally between polls, `reserved` only changes when the
queue itself changes, so caching `available` would drift stale between polls.

`BuildQueuePanel.vue`'s fabricated `TOTAL_SLOTS` is gone; the header reads the real
`{{ slotsUsed }} / {{ slots }}`. A waiting row renders dim, with no progress bar, "Waiting for a slot" in
place of a countdown, and is still cancellable. `ResourceBar.vue` draws a dim reserved segment (the trailing
slice of the stock already in the bar) plus a "(N reserved)" hint per pill. `BuildingModal.vue` checks
affordability against `available`, reads "Queue build" when no slot is free, and shows "Queued — waiting for
a construction slot" instead of a build/upgrade button on a hex that already has one. `TrainingModal.vue` and
`ArmyPanel.vue`'s dispatch-provisions default are computed from `available` too.

Demo mode has no backend construction-slot/reservation concept at all — `hud.construction` defaults to a
fixed 2-slot, non-premium, zero-reservation summary, and `refreshLiveSettlement` (the only place these fields
are ever refreshed) stays a true no-op there, same as every other live-only field.

## What this does *not* do

- Pre-existing, unchanged by this work: two concurrent build requests can both observe the same free slot on
  *different* hexes and momentarily over-fill. Not a regression, not fixed here.
- The Stage 1d per-hex stacking tier is fully built and tested but switched off — no monetisation design
  exists for it yet.

# Beginner protection (new-player attack shield)

Design for issue #132: a no-attack shield for new accounts, plus spawn-area
segregation by account age. The design questions below are answered from
directives given directly on the issue; each answer says what it means for
implementation and what it depends on elsewhere in the repo.

## 1. Shield duration

**Min 3 days, max 14 days, scaled to world runtime** — not a flat constant.
`WorldEntity.SpeedFactor` (`src/backend/src/Bjarnoy.Infrastructure/Entities/WorldEntity.cs:92`)
already multiplies build speed and production; a shield sized for a 1x world
would leave a 5x-speed world's early game almost entirely unprotected (a
newcomer on a fast world reaches farmable strength in a fraction of the
wall-clock time). Shield length should shrink with `SpeedFactor` the same way
build times do, then clamp to the [3, 14] day range:

```
shieldDays = clamp(BaseShieldDays / world.SpeedFactor, min: 3, max: 14)
```

`BaseShieldDays` is an admin/world-level constant (a reasonable default is 7,
matching Travian's ~5-day shield scaled up slightly for this genre's slower
early curve) — not hardcoded, so different worlds can tune it the same way
`SpeedFactor` itself is already set per world at creation
(`AdminWorldEndpoints`/`AdminWorldContracts`). `ShieldExpiresAtUtc` is computed
once at founding time from the settlement's `FoundedAt` and the world's
`SpeedFactor` at that moment, not re-evaluated if an admin changes
`SpeedFactor` later.

## 2. Early yield (voluntary shield drop)

Yes — a protected player can drop their own shield to attack earlier, the
standard opt-out this genre expects (nobody should be locked out of playing
offensively for two weeks against their will). This needs a domain/backend
method now — `Settlement.YieldShield()` clearing `ShieldExpiresAtUtc`, plus an
endpoint that calls it — but **no frontend control ships in v1**. No button,
no UI affordance; the capability exists so the endpoint can be exercised
(tests, admin tooling, and the account-confirmation interaction in §5, which
*requires* yielding to be a distinct action from expiry) without committing to
UI/UX for it yet. Frontend work is a follow-up once the flow is
designed on its own terms (confirmation dialog, warning copy, etc.).

## 3. Does the shield drop on the protected player's own attack?

Yes, unconditionally, and this isn't really a design question — it's the
core invariant the whole feature rests on: **the shield is only on while the
player doesn't attack.** A dispatch that leaves a shielded settlement with
`AttackType`/intent other than scouting must clear `ShieldExpiresAtUtc` (or
reject the dispatch if the design instead wants shielded players unable to
attack at all — see §5, which already carries a stronger version of this rule
for unconfirmed accounts). Framed as an anti-abuse concern ("what if the
protected player attacks someone else") it answers itself: that's not a gap
to close, it's the mechanism already yielding the shield via §2 — sending an
attack *is* one way to yield it, just an implicit one instead of an explicit
call. The two only differ in whether the player meant to give up protection
(§2) or just fired an attack without thinking about it (this section) — both
end in the same state.

## 4. Interaction with NPC settlements

Already has its own design track — issue #125 ("Design: NPC settlements —
hostile, peaceful, and trader villages"), which recommends shipping
**peaceful** NPC settlements first, explicitly as safe early-raid targets.
This issue doesn't re-design that; it just records the dependency: once
peaceful NPCs exist, a shielded new player's tutorial/early-game raid
suggestions (whatever surfaces "attack this") should point at nearby peaceful
NPC settlements rather than at real neighbours, so a player can go on the
offensive during their shield window without it costing them the shield
(§2/§3) against another human. No new mechanic needed here — just a targeting
preference once #125 lands.

## 5. Interaction with account confirmation

This issue trades on a feature that doesn't exist yet: issue #108 plans
`UserStatus.Unconfirmed` and an email-verification flow, currently unbuilt
(`UserEntity.Status` only has `Active` today). The rule, once #108 lands:

- **While `Status == Unconfirmed`, the player can neither attack nor yield
  their shield.** Both are blocked at the same endpoint-filter layer that
  already gates other account-state checks (`OwnershipEndpointFilters`),
  alongside a confirmed-status check. This closes the obvious abuse case
  (spin up an unconfirmed throwaway, farm the safety of a shield that never
  has to expire because the account never has to attack) without needing any
  shield-specific code — an unconfirmed account simply can't perform the one
  action (§3) or explicit call (§2) that would end it early.
- **Corollary: the account-confirmation deadline must be ≤ the minimum
  shield length (3 days).** If confirmation could take longer than the
  shield can possibly last, a real-but-slow-to-confirm player would hit
  shield expiry while still locked out of attacking — protected on paper,
  defenseless in practice, worse than either state alone. So whatever
  deadline #108's flow sets for "confirm or lose the account/be
  auto-suspended" has to resolve by day 3 at the latest, independent of
  world speed. This is a constraint on #108's design, not something this
  issue builds — noted here so the two aren't designed without each other in
  view (the same reason #132's own body calls out coordinating with #113).

## 6. Spawn-area segregation by account age

**Current state, verified in code:** there is no beginner-area logic today,
and what exists is entirely backend-fed, unfiltered. `GET
/worlds/{worldId}/islands` (`WorldEndpoints.cs:36-38` →
`WorldService.GetIslandsAsync` → `IslandResponse.From`) returns **every**
island's `StartPositions` for the world, with no per-island signal about who
(if anyone) is already settled there. The frontend does no more than pick a
point out of that full set: `LandingView.vue` previews
`world.nearestStartPosition({ q: 0, r: 0 })` and lets the player found on any
of `world.nearbyStartPositions({ q: 0, r: 0 })`
(`src/frontend/src/views/LandingView.vue:74-87`), both just nearest-distance
lookups over whatever the backend sent — there's no client-side concept of
"who's on this island" either, nor should there be; ownership/shield state
lives server-side and a client-computed suggestion would just be a race
against every other client doing the same computation over the same stale
snapshot. The backend's `FoundAsync` (`SettlementService.cs`) separately only
checks that the target hex is a real `StartPositions` entry, isn't taken, and
clears `MinimumSpacing` from other settlements *on the same island*
(`SettlementService.cs:221-246`) — no concept of "how new is everyone else
here" either. So "the beginners area is implemented by checking the landing
page locations in the backend" describes where this has to live, not
something already built; this issue is where that gets designed:

- **The backend does the filtering, not the frontend.** The suggestion rule
  belongs in `WorldService`/`WorldEndpoints`, in the same place that already
  assembles `IslandResponse` for `GET /worlds/{worldId}/islands` — either by
  having that endpoint only return (or flag) islands that currently qualify
  as beginner-suitable, or by adding a dedicated "suggest a beginner island"
  read that `LandingView.vue` calls instead of picking nearest-by-distance
  over the full unfiltered list. Either way the client keeps doing exactly
  what it does today — take whatever the backend hands it and preview/found
  on that — it just stops being handed the whole world's start positions
  undifferentiated.
- **Island suggestion rule:** an island offered as a landing spot should have
  no players on it yet, or only other players still inside their own shield
  window (i.e., still beginners by the same clock this issue defines in §1).
  Concretely: the backend query answering `GetIslandsAsync` (or its new
  beginner-suggestion counterpart) joins each island's `StartPositions`
  against `Settlements` on that island and keeps only islands where every
  founded settlement has `ShieldExpiresAtUtc > now`. Once an island has any
  unshielded (graduated) settlement on it, it drops out of the beginner pool
  for new foundings; existing settlements on it are unaffected, and
  `FoundAsync` itself is unchanged — the filtering happens before a start
  position is ever offered, not as a new rejection reason at founding time.
- **Ring mechanic.** As beginner islands near the world's spawn origin fill
  up, new foundings get pushed progressively further out — expanding rings
  around the origin, rather than always contesting the same starter cluster.
  This is a **read-time bucketing of data that already exists**, not a
  change to world generation: `WorldGenerator` keeps generating the whole
  map up front exactly as it does today (`WorldGenerator.cs:39-81`,
  `Radius`/`Centre`/`StartPositions` all unchanged), and no new column is
  added to `IslandEntity` or `WorldEntity`. A ring number is derived,
  on the fly, from data already persisted:

  ```
  ringOf(island) = HexCoord.Distance(HexCoord.Origin, island.Centre) / ringWidth
  ```

  using the `HexCoord.Distance` helper that already exists
  (`HexCoord.cs:37-41`) and each island's already-persisted `CentreQ`/
  `CentreR`. `ringWidth = world.Radius / ringCount`, for a small fixed
  `ringCount` (e.g. 6-8) rather than a flat hex constant — a flat constant
  either wastes most of a large `Radius` world on one giant ring 0 (a
  100-hex-wide ring 0 on a `Radius: 1000` world is most of the map, not a
  starter cluster) or slices a small world into more rings than it has room
  for. `world.Radius` already exists per world (`WorldEntity`), so
  `ringWidth` is one division, done once per beginner-suggestion query, not
  per island. At the default `Radius: 60` and `ringCount: 6`, ring 0 is
  hexes 0-9 from the origin — genuinely the innermost sliver of the map,
  not "most of it" — with five more rings stepping outward before the map
  edge. Bigger/smaller worlds keep the same *number* of rings and the
  expansion just scales with them, so the mechanic behaves the same way
  regardless of `Radius`.

  **Selection:** the beginner-suggestion query (§ above) walks rings
  innermost-first and returns islands from the first ring that still has
  spare beginner capacity (a threshold on unfilled `StartPositions` across
  that ring's qualifying islands — e.g. at least one open, un-graduated
  plot). Only once a ring is exhausted does the query fall through to the
  next ring out. This is a tie-break/ordering rule layered on top of the
  existing-vs-graduated filter above, not a separate mechanism — the same
  query, same data, one more `GroupBy`.

## Ring fill-state cost

The two halves of "which ring is this island in, and is that ring still
open to beginners" have very different lifetimes, so they get different
caching treatment rather than one blanket answer.

**Ring assignment (island → ring number) is static and cheap enough not to
need caching at all**, but is safe to cache indefinitely if it's ever worth
doing:

- It's a pure function of `world.Radius` (fixed at world creation) and each
  island's `Centre` (fixed at world generation, `WorldGenerator.cs:64-72`)
  — neither ever changes for the life of a world, short of an admin
  force-reseed (`AdminWorldEndpoints`'s reseed flow, which already replaces
  the island rows wholesale). One `HexCoord.Distance` call per island
  (`HexCoord.cs:37-41`) against numbers already in memory from the
  islands-for-this-world fetch — no query, no index, no storage either way.
- If it's ever measured as worth avoiding even that per-request loop, an
  in-memory `Dictionary<IslandId, int>` cached per world for the process
  lifetime (invalidated only on reseed, the one event that changes
  `Centre`) is correct and never goes stale — this is the one part of the
  mechanic where "cache for hours" undersells it; it can be cached until
  the world is reseeded or torn down, full stop.

**Fill state (which rings currently have spare beginner capacity) is the
opposite: it changes on every founding and every shield expiry**, so it
needs to stay close to live, not sit for hours:

- It rides the same `Settlements`-joined-to-`Islands` query the
  shield-based filter (the bullet above) already runs — index-backed via
  the FK EF creates on `Settlements.IslandId` by convention
  (`GameDbContext.cs`'s `settlement.HasOne(s => s.Island)...`), grouped by
  ring in memory after the fetch. That query is cheap on its own (bounded
  by island/settlement counts, not by scanning the world), which is the
  point — it doesn't *need* an hours-long cache to be affordable.
- A multi-hour cache would actively misbehave here: it would keep
  suggesting a ring as "open" for hours after its last slot filled (or,
  worse, keep a ring marked full long after a shield expired and vacated
  it — shields expire on their own schedule from §1, not in response to
  anyone founding), pushing new players out to the wrong ring or stacking
  them past capacity. If a cache is added at all, it should sit in the
  seconds range — the existing `UserActivityService.ThrottleInterval`
  (60s, `UserActivityService.cs:32`) and the frontend's 4s rival-refresh
  poll are this codebase's precedent for "how fresh does live-ish state
  need to stay," and either is a closer fit than hours.

Net: no new table, no new index, no background job. The static half (ring
number) is cheap enough to skip caching or, if wanted, cache without an
expiry at all; the dynamic half (fill state) is cheap enough on its own
that it doesn't need caching to be affordable, and specifically shouldn't be
cached for hours if it is.

## Scope

Design only, per the issue. Implementation is a follow-up and should land
after (or alongside, for the parts that don't strictly depend on it):

- #108 (account confirmation) for §5's gating and deadline constraint.
- #125 (NPC settlements) for §4's raid-target suggestion, once peaceful NPCs
  ship.
- #113 (multi-account detection) stays a design-time cross-reference per the
  issue body — a faked "new" account claiming a shield is exactly the kind of
  signal #113 is meant to catch; this issue doesn't duplicate that detection
  work, just doesn't design the shield to make the abuse case worse (e.g. §5
  already denies an unconfirmed throwaway the ability to ever legitimately
  need to drop its own shield).

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
  innermost-first and returns islands from the first ring with an actually
  **open** plot — "capacity" here means literal unfounded `StartPositions`,
  not merely "no graduated settler yet." Those are two different
  conditions and both have to hold for an island to be offered:
  - **Qualifies at all** (§ above): no *graduated* (unshielded) settlement
    on the island.
  - **Has capacity**: at least one of the island's `StartPositions` is
    both unfounded *and* not within `SettlementService.MinimumSpacing` of
    any settlement already on the island — not simply
    `StartPositions.Count - SettledCount(island) > 0`. `FoundAsync`
    already rejects a candidate hex within `MinimumSpacing` of an existing
    settlement as `TooCloseToNeighbour` (`SettlementService.cs:244-247`),
    same-island only per its own comment, and `MinimumSpacing = 2 *
    Settlement.MaxClaimRadius + 1` (`:141`) is deliberately sized so a
    settlement's claim disc can never physically reach another
    settlement's centre — so **one founding can silently take out several
    nearby `StartPositions` at once**, not just the exact hex clicked.
    `openPlots` has to reflect that, or it would keep advertising a
    position that a founding attempt would immediately reject.

  An island can qualify without having capacity — every one of its
  `StartPositions` can already be taken by *other beginners*, all still
  inside their shield window, with nobody graduated yet. That island is
  still "beginner-only," but there is nowhere left to click on it, so it
  must be excluded from what gets offered even though it isn't
  disqualified by the graduation rule. The ring only counts as having
  spare capacity if at least one qualifying island in it has `openPlots >
  0`; only then does the ring get offered, and only once every island in a
  ring has `openPlots == 0` (or is disqualified) does the query fall
  through to the next ring out.

  **A single exhausted ring just moves the walk one ring further out** —
  that's the normal case, not a fallback: `ringOf` is unbounded arithmetic
  (`distance / ringWidth`), not capped at some fixed `ringCount`, so "ring 6
  is exhausted" simply means try ring 7, same as ring 0 exhausted means try
  ring 1. The walk only ever stops for real once it has covered every ring
  that actually contains an island — bounded by the map edge (`world.Radius
  / ringWidth`), not by an arbitrary ring limit — so a beginner-safe
  candidate keeps getting looked for out to the literal edge of the world
  before anything gives up.
  **Only genuine total exhaustion falls back**, and that's a materially
  different, much rarer case than "one ring filled up": every island in the
  entire world either has a graduate on it or zero open plots. At that
  point there is no beginner-shaped spot left anywhere, not just in the
  inner rings, and the query falls back to today's plain
  nearest-open-start-position search with the beginner filter dropped
  (rather than refusing to suggest anywhere) — worst case a new player
  lands next to a graduated neighbour exactly as they would today, without
  this feature. This same state is close to (or coincides with) the
  existing `WorldFull` condition `FoundAsync` already has a rejection
  for — it isn't a new kind of failure this feature introduces, just the
  point where there's nothing beginner-specific left to offer.

  This is a tie-break/ordering rule layered on top of the
  existing-vs-graduated filter above, not a separate mechanism — the same
  query, same data, one more `GroupBy`.

  **Does the backend/tests handle this today?** Only the reactive half.
  `FoundAsync`'s per-hex `PlotTaken` rejection
  (`SettlementService.cs:238-241,293-296`, backed by the unique
  `(WorldId, CentreQ, CentreR)` index for the race-safe case) is real and
  covered by existing tests — but that only fires *after* a client already
  tried to found on a specific, already-taken hex. There is no proactive
  "does this island/ring have any open plot left" query anywhere in the
  codebase today, because the beginner/ring suggestion endpoint itself
  doesn't exist yet — `openPlots`, the ring walk, and the exhausted-ring
  fallback above are new logic this issue's implementation still has to
  write and test, not something already handled. Test cases worth adding
  when it's built: an island fully claimed by beginners (still
  "qualifying," zero `openPlots`, must be skipped); a ring where every
  island is in that state (falls through to the next ring); and every ring
  exhausted (falls back to the unfiltered nearest-open-plot search).

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

**Fill state changes on every founding and every shield expiry** — but those
are two different fields with two different causes, and each is cheap
enough to cache *per island*, not just per world, so the ring walk never
has to re-check individual islands against the database at request time.
To be clear throughout, this is an in-process/application cache (one
`IMemoryCache` entry per world holding these small maps, not an HTTP
cache-control header — nothing about this suggestion is client-cacheable,
it's re-decided server-side on every landing-page load), not a time-based
TTL guessed at from "how fresh does this feel":

- **`Dictionary<IslandId, int> openPlots`** — the corrected count from
  above (unfounded *and* clear of `MinimumSpacing`), per island. It only
  ever changes by founding a settlement — no other player action moves
  it (buildings, including towers, are placed only within a settlement's
  own already-established `Claims(coord)` disc, i.e. `ClaimRadius` hexes
  of its own centre; `ClaimRadius` tracks `LonghouseLevel` alone, and
  `MinimumSpacing`'s `2 * MaxClaimRadius + 1` sizing is exactly what
  guarantees that disc can never reach a neighbour's `StartPositions` —
  so there's no path from "someone built a tower" to a plot disappearing,
  today). But because one founding can invalidate several `StartPositions`
  at once (previous bullet), this isn't a plain decrement-by-one: on a
  successful founding, recompute *that one island's* entry by re-walking
  its own (small, fixed-size) `StartPositions` list against its (now one
  larger) settlement set — still no DB round trip beyond what `FoundAsync`
  already did to insert the settlement, and still scoped to a single
  island, just not a bare `-1`.
- **`Dictionary<IslandId, DateTimeOffset> earliestGraduationRisk`** — per
  island, the earliest `ShieldExpiresAtUtc` among its currently-shielded
  settlements (or "already has a graduate" as a distinct, permanent state
  once true — a graduated island never un-graduates). This is the one
  piece that changes by clock rather than by event, so it's the one piece
  that needs an actual expiry: cache each island's entry with
  `AbsoluteExpiration` set to that island's own earliest timestamp
  (`IMemoryCache` takes a `DateTimeOffset` directly), so only islands
  whose shield window is actually about to lapse ever get recomputed —
  not the whole world's islands on every request, and not on a guessed
  poll interval either.
- **`Dictionary<IslandId, int> ringOf`** — the static half from above,
  cached without an expiry (or none at all, since it's cheap regardless),
  invalidated only by a reseed.

With all three warm, the ring walk at request time is pure in-memory
dictionary lookups and grouping — zero database queries. A cache miss on
any one island (first request after a reseed, or the specific island whose
shield timer just lapsed) recomputes only that island's row, not the
world's.

**Is this too much caching?** No — it's proportionate, not layered
complexity. All three maps together are bounded by island count, which is
itself bounded (a few hundred, worst case, per §"How many islands a world
actually has" above) and each entry is one or two primitives, so total
size per world is a few KB, not a meaningful memory concern even across
many concurrent worlds. It isn't three independent caching *decisions*
either — it's one payload (the same islands-plus-settlements data the
beginner query already has to look at) split into the three fields that
actually have different lifetimes, so each can be invalidated exactly
right instead of the whole thing being re-fetched or guessed-at with a
TTL. That's less work than the single whole-world-cache approach from the
first pass at this section — `openPlots` only ever recomputes the one
island a founding just happened on, and `earliestGraduationRisk` only ever
recomputes the one island whose window lapsed, rather than treating every
founding or every clock tick as a reason to throw away everything cached
and start over.

## 7. Admin visibility

Both the fill picture and the total-exhaustion fallback state need to be
visible to an admin, not just live inside the suggestion query's own
in-memory cache. `AdminWorldsView.vue`'s world table already surfaces
per-world live state this way — `Players`, `Joinable`, `Endboss`
columns, each backed by a field `WorldResponse`/`AdminWorldEndpoints`
computes server-side (`WorldContracts.cs`) — so this extends that existing
table rather than inventing a new admin surface:

- **A "Beginner rings" column**, summarizing the same `openPlots`/
  `earliestGraduationRisk` state the suggestion query already caches per
  world — e.g. how many rings currently have spare beginner capacity out
  of how many contain any island at all, so an admin can see at a glance
  whether new players are still landing near the origin or have already
  been pushed several rings out.
- **A visible flag for the fallback state itself**: when a world has hit
  genuine total exhaustion (§ above — every island either graduated or at
  zero `openPlots`, the point where the suggestion query stops filtering
  by beginner status at all), that's exactly the kind of thing an admin
  needs to notice on its own, not discover from player complaints about
  landing next to a graduated neighbour. Surfacing it as its own column
  (or folded into the existing `Joinable`/`Endboss`-style status cell) is
  the same "is this world healthy" signal those columns already give for
  other conditions — this is one more.
- Both read straight off the same `IMemoryCache` state described above
  (or a fresh computation if that world's cache happens to be cold) — no
  new persistence, no new job; it's the existing admin-worlds list making
  one more already-computed fact visible, the same way it does for player
  count and joinability today.

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

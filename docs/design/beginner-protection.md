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

**Current state, verified in code:** there is no beginner-area logic today.
Founding lands on a deterministic starter plot near the world origin
regardless of who else is nearby — `LandingView.vue` always previews
`world.nearestStartPosition({ q: 0, r: 0 })` and lets the player found on any
of `world.nearbyStartPositions({ q: 0, r: 0 })`
(`src/frontend/src/views/LandingView.vue:74-87`); the backend's `FoundAsync`
(`SettlementService.cs`) only checks that the target hex is a real
`StartPositions` entry, isn't taken, and clears `MinimumSpacing` from other
settlements *on the same island* (`SettlementService.cs:221-246`) — it has no
concept of "is anyone else already here" or "how new is everyone else here."
So "the beginners area is implemented by checking the landing page locations"
is aspirational, not yet true; this issue is where that gets designed:

- **Island suggestion rule:** an island offered as a landing spot should have
  no players on it yet, or only other players still inside their own shield
  window (i.e., still beginners by the same clock this issue defines in §1).
  Concretely: extend the start-position/island lookup the landing flow already
  calls with a filter — an island qualifies if every founded settlement on it
  has `ShieldExpiresAtUtc > now`. Once an island has any unshielded
  (graduated) settlement on it, it drops out of the beginner pool for new
  foundings; existing settlements on it are unaffected.
- **Ring mechanic (future work, not this issue's scope):** as beginner
  islands near the world's spawn origin fill up, new foundings should be
  pushed progressively further out — spawning in expanding rings around the
  origin over time, rather than always contesting the same starter cluster.
  This needs its own design pass (how a "ring" maps onto the existing
  hex/island generation in `WorldGenerator`/`GeneratedWorld`, and whether
  rings are precomputed at world-generation time like `StartPositions`
  already are, or computed lazily as islands fill) — recorded here as a
  known follow-up so the island-suggestion filter above isn't built in a way
  that forecloses it (e.g., don't hardcode "always prefer the island nearest
  origin" as the tie-break once multiple qualifying islands exist).

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

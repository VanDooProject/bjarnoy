# Missing-features roadmap — post-#91 audit

Scope note up front: **hero/avatar systems and a win-condition/world-wonder mechanic are explicitly out of scope** (maintainer call — hero/avatar is unlikely to ever be built here; win condition is a known, deliberately deferred gap, not a forgotten one). Neither appears below.

This doc covers the remaining gaps identified across `docs/codebase-gap-analysis.md`, issue #53's "things you might have forgotten" checklist, and issue #91, after verifying current `main` so nothing already shipped is proposed again. Two items originally suspected missing turned out to already be built and are called out as **closed**, not re-opened here:

- **Battle-report and chat frontend UI** — fully wired (`ReportsView.vue`, `MessagesView.vue`, `ConversationView.vue`, `AdminReportsView.vue`, live nav links with unread badges in `HudNav.vue`). The gap-analysis doc predates this landing.
- **Premium flag** — `IsPremium` is now settable via `POST /{userId}/premium` (`AdminUserEndpoints.cs`) and read by `PremiumUserEndpointFilter`. What's still missing is a *currency* behind it — see §7 below, which is a materially different, still-open gap.

Each section below gets its own GitHub issue; this doc is the shared rationale and prior-art reference, same role `settlement-expansion.md` plays for #55/PR #72.

---

## 1. Loyalty / conquest — settlement capture

MECHANICS.md §8 states "settlements can be captured" but there is no capture mechanic, currency, or pacing gate anywhere in the domain — `docs/codebase-gap-analysis.md` independently flags this ("razing is partial... conquest/capture is unimplemented").

- **Travian**: a Chief/Chieftain unit strikes loyalty down per hit (up to 3x per attack wave); a village flips to the attacker at 0 loyalty; loyalty regenerates slowly over time between hits, so conquest is a multi-wave siege, not a single raid.
- **Die Stämme**: a Noble (Adelsgeschlecht) unit does the same job but is itself expensive and capped in count per player, making nobles a strategic bottleneck resource.
- **Recommendation**: adopt the Travian shape (a stat that depletes per hit and regenerates), since it fits a real-time hex map better than a capped-noble economy would — nobles-as-scarce-resource works against Die Stämme's turn-adjacent pacing, less so against this game's continuous clock. Needs its own conquest unit (Civilian or a new class) and interacts directly with the existing garrison/Army combat system (#40) once that's stable.

## 2. Alliance (guild) tooling

The guild/alliance backend and frontend (#54, #70) cover membership, fee tiers, a board, and peace treaties. Missing, per MECHANICS.md §8 ("clans share vision, coordinate landings, hold islands jointly") and #53's checklist:

- Shared vision — a guild-mate's explored/scouted hexes visible to the whole guild (depends on §6's server-side vision work existing first).
- Reinforcement permissions — letting a guild-mate garrison your settlement without full account access.
- Diplomacy states beyond peace treaties — NAP, war declarations, visible on the world/diplomacy map.
- Alliance-wide announcements/broadcast, separate from the existing board.

## 3. NPC settlements — hostile, peaceful, and traders

No barbarian/NPC concept exists beyond an inert seed row (`SystemUserIds.Barbarians`, referenced nowhere). Requested shape: **three NPC settlement types**, not one generic "barbarian village."

| Type | Behaviour | Prior art |
| --- | --- | --- |
| **Hostile** | Garrisoned, defends itself, drops loot on defeat. Never attacks first. | Travian's Natar/nature-guarded oases; Die Stämme's barbarian villages (undefended, easy early farm); Rise of Kingdoms/Lords Mobile "barbarian camps" (respawning PvE targets, deliberately farmable). |
| **Peaceful** | Undefended, produces or holds a resource stockpile, can simply be occupied/raided like any weak target — this is the "safe early farm" role. | Die Stämme's barbarian villages again — the point there is zero risk, not combat. |
| **Trader** | Cannot be attacked directly (hard rule), OR *can* be attacked but doing so triggers retaliation from other NPCs (a reputation/bounty mechanic) — pick one, don't build both for v1. | No mainstream browsergame has an unattackable roaming trader on the *same* hex map as the real economy; the closest analogues are off-map: Forge of Empires'/Elvenar's Trader (a building-side NPC deal screen, not a map entity) and OGame's Merchant NPC ship. The "attack it and get raided back" shape is closer to open-world MMO faction-standing retaliation (EVE Online NPC empire response fleets) than anything in this genre — genuinely closer to novel design than a borrowed pattern. |

**Recommendation for v1**: ship hostile + peaceful first (both have direct, well-trodden precedent and reuse the existing garrison/combat model with an NPC owner instead of a player). Treat the trader type as its own follow-up design pass — the "attacked → other NPCs retaliate" idea needs a reputation/bounty stat that doesn't exist yet, and the "flatly unattackable" version needs an exception carved into the combat/dispatch validation that nothing else in the codebase currently needs. Don't block hostile/peaceful on resolving trader design.

## 4. Oasis / bonus tiles

A natural pairing with §3's hostile NPC type: a capturable map hex granting a standing resource-production bonus once held (Travian's oases, gated by the same nature-guardian creatures as hostile NPCs above). Kept as a separate issue from NPC settlements because the *ownership* model differs — an oasis attaches its bonus to whichever settlement's claim radius currently covers it (interacts with claim-radius growth, not with founding), whereas an NPC settlement is itself a settlement-shaped entity with its own hex.

## 5. Quests / achievements

The strongest retention tool in the genre per #53's own framing, and there's already a tutorial to hang it off (issue #95, currently buggy — doesn't show a build queue). No quest/achievement code exists at all (confirmed by grep).

- **Travian**: a linear beginner quest chain doubling as the tutorial, drip-feeding resources and unlocking UI panels one at a time; separate ongoing daily/weekly quests later.
- **Recommendation**: fix #95's tutorial bug first (or in the same pass), since a quest chain and "the tutorial" are the same system here, not two systems — building quests without first fixing the broken build-queue-visibility bug in the existing guided flow would ship two half-broken versions of the same experience.

## 6. Scouting & vision

**Confirmed by reading current code, not assumed:** neither of the two scouting mechanisms exists today.

- Fog of war is **client-side only and settlement-derived**: `WorldModel.visibleHexes(settlement)` / `exploredRadius(settlement)` compute visibility purely from a settlement's own position (`borderRadius + 1` visible, `+3` explored-and-greyed), independent of any army. This is the same architecture gap `docs/codebase-gap-analysis.md` already flags ("server-side fog of war is not implemented... design doc calling out backend-supplied fog as the intended model").
- **No movement-based reveal**: an `Army` marching across the map has zero effect on fog — nothing connects `Army`/movement to `visibleHexes`/the explored set.
- **No stationary garrison vision**: a garrisoned army grants no vision radius of its own; all vision is the settlement's, whether or not troops are present.
- Issues #20 (fog issues) and #24 (map graphics) are **rendering/asset bugs only** — layering order, jitter, missing sprites — neither proposes the architecture change below. No other open issue covers this.

**Design direction**: move fog to server-authoritative (matches the gap analysis's own recommendation), and add the two requested mechanisms on top of it:
1. **Movement reveal** — an army's path (already computed and frozen at dispatch — reuse `Movement`'s waypoints) reveals hexes it passes through, one-time (matches "the white one" going away permanently, i.e. explored-forever, consistent with the existing client model's explored set).
2. **Garrison vision** — a settlement's garrisoned army stack contributes a vision radius on top of the settlement's own, so a heavily garrisoned border settlement sees further than an empty one — gives standing troops a purpose beyond defense stats.

Scout-specific units/espionage (seeing an enemy's garrison/wall level) is a further follow-up, not required for v1 of either mechanism above.

## 7. Premium currency & admin top-up

Distinct from the now-closed boolean `IsPremium` flag. Needed: a spendable in-game currency (name TBD — "Gold" collides with `GuildFeeTier.Gold`, which is paid in ordinary resources, not a currency; needs a different name) that backs whatever premium features accrue (queue extensions, instant-finish, cosmetics), following the design sketched at <https://claude.ai/chat/56e536df-b3c4-42d5-904b-884c9c274198>.

Admin requirements (new, not in #105's current scope):
- Grant currency to a **single player**, mirroring the existing `AdminSettlementEndpoints.cs` resource-grant pattern but for currency instead of wood/stone/food/iron.
- Grant to **all players** at once (event top-ups — Christmas, Easter, etc.).
- Both grant types support **instant** delivery or a **timed/scheduled** grant (deliver at a future date) — the codebase currently has no generic timed-delivery mechanism; the closest precedent is the existing `BackgroundService` pattern (`EndbossTriggerHostedService`, `WeeklyAggregationHostedService`) for the scheduling half, none of which grant anything today.

This should be scoped as its own issue separate from #105 (admin UI), since it needs backend currency-ledger design first; #105 already lists enough UI-only work to stay focused.

## 8. World speed & round/reset lifecycle

`speedFactor` already exists in the domain (per the gap analysis) but there's no round lifecycle, world registration flow, or archive story around it — a speed server or seasonal reset is pure world-creation/admin-UI plumbing on top of an existing knob, not a new game-mechanic.

## 9. Multi-village management / overview UI

`ExpansionPanel.vue` (PR #72) is a settlement **switcher**, not an overview — the gap analysis's ask ("village switcher, overview lists — all queues/stocks/incoming attacks in one table") is still open once a player holds more than one or two settlements. Pain scales directly with how well §1 (loyalty/conquest) and PR #72's founding both succeed at growing settlement counts, so this becomes urgent exactly when those succeed.

## 10. Beginner protection

No-attack shield for new accounts/low-point players, plus spawn-area segregation by account age — without it, new players on a shared island get farmed day one. Directly interacts with #113's founding-audit-trail/multi-account-detection work (an attacker who fakes a "new" account to grief real newcomers is the abuse case beginner protection has to survive) and with §3's peaceful NPC villages (a natural place to point a shielded new player instead of at real neighbours).

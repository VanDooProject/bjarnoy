# Guild / alliance system

Design for Bjarnoy's guild (alliance) system: a world-scoped group of players
that pays a recurring fee for perks, runs a small message board, and can make
peace with other guilds. Drafted with Fable, then scoped down to a buildable
v1 slice for this repo's current state (no trade/market system, no army/unit
system, no invites/applications infrastructure yet).

## 1. Naming

Kept in plain English in the code and wire contracts (`Guild`, `Leader`,
`Officer`, `Member`, `FeeTier`, `PeaceTreaty`) rather than in-universe Norse
terms — the frontend can still skin these as "Hird" / "Jarl" / "Tithe" /
"Frith Pact" in copy without the backend needing to change. This keeps the
API legible from other tools (OpenAPI, tests) without a glossary.

## 2. Data model (as implemented)

- **`GuildEntity`** — `WorldId`, `Name`, `Tag`, `Description`, `FeeTier`
  (`Copper`/`Silver`/`Gold`), `CreatedAt`, `DisbandedAt` (soft delete). Name
  and tag are unique per world, not globally — each world is its own
  playthrough.
- **`GuildMembershipEntity`** — `GuildId`, `UserId`, `Role`
  (`Leader`/`Officer`/`Member`), `JoinedAt`, `FeePaidThroughAt`. One row per
  active membership; **removed outright on leave/kick** rather than soft-left.
  v1 keeps no membership history, so there is no rejoin cooldown and no audit
  log yet (see §5). A user may hold at most one active guild membership
  game-wide, enforced by a unique index on `UserId`.
- **`GuildBoardTopicEntity`** / **`GuildBoardPostEntity`** — a topic has a
  `Kind` (`Discussion` / `Announcement` / `Report`) and carries its opening
  message as its first post; further posts are replies. `Report` is the
  forward-looking hook for game event reports (battle reports, etc.) — that
  feature does not exist yet, so a report topic today is just a normal topic
  flagged this way for the client to render distinctly and for a future
  reports feature to attach into.
- **`GuildPeaceTreatyEntity`** — `ProposerGuildId`, `TargetGuildId`,
  `ProposedByUserId`, `Status` (`Proposed`/`Active`/`Rejected`/`Withdrawn`/
  `Broken`), `ProposedAt`, `RespondedAt`, `RespondedByUserId`. Purely
  informational: there is no combat system yet for it to gate.

## 3. Core rules

### Fee tiers

| | Copper | Silver | Gold |
|---|---|---|---|
| Recurring fee (each resource, per 24h) | 50 | 200 | 600 |
| Member cap base | 10 | 20 | 30 |
| Max active peace treaties | 1 | 3 | 6 |
| Trade capacity bonus (future hook) | 0% | +10% | +25% |
| Unit support unlocked (future hook) | no | no | yes |

All of this lives in `GuildRules` (`Bjarnoy.Domain.Guilds`) — pure functions,
no I/O, unit-tested directly.

### Member cap

```
memberCap = tierBase + floor(highestLonghouseLevel / 2)
```

`highestLonghouseLevel` is the highest Longhouse level across all current
members' settlements in that world (`GuildService.HighestLonghouseLevelAsync`),
recomputed live on every join/perks check rather than cached. The Longhouse is
the only anchor building today; if a dedicated civic building (a "Chieftain's
Hall" or "Meeting Hall") takes over this role later, the intent is that
callers read its level through that one method instead of inlining
`Settlement.LonghouseLevel` at every call site, so the swap is a one-line
change rather than a schema migration.

Lowering a guild's fee tier (or losing the member holding the highest
Longhouse) can push it over its own cap. Nothing is auto-kicked and no treaty
is auto-broken — the guild simply cannot accept new members or propose new
treaties until it is back under the new caps on its own. This "frozen state"
falls out naturally from `JoinAsync`/`ProposeTreatyAsync` checking live caps
rather than needing a separate mechanism.

### Fee payment

`GuildService.PayFeeAsync` deducts `GuildRules.FeeCost(tier)` from the
caller's settlement in the guild's world (one settlement per player per
world, per the existing rule) using the same settle-then-`TrySpend` pattern
`SettlementService` uses for builds, and extends
`GuildMembershipEntity.FeePaidThroughAt` by 24h. There is no scheduled
auto-collection job in v1 — paying is a manual action a member takes; a
member whose `FeePaidThroughAt` has passed is simply "overdue"
(`GuildMemberResponse.FeeOverdue`), with no other consequence yet (no perk
loss, no auto-kick). Fees are a resource sink in v1 — see §5, guild bank.

### Membership lifecycle

- **Found**: any user not already in a guild can found one; the founder
  becomes its `Leader`; the guild starts at `Copper`.
- **Join**: open — no invite/application step in v1 (see §5). Refused once
  the guild is at its member cap, or the user is already in a guild.
- **Leave**: any non-`Leader` member may leave anytime. A `Leader` may only
  leave alone — leaving as the guild's last member disbands it
  (`DisbandedAt` set). Otherwise the `Leader` must hand off leadership first.
- **Kick**: `Leader` kicks anyone but themselves; `Officer` kicks `Member`s
  only.
- **Leadership transfer**: `SetRoleAsync(..., GuildRole.Leader)` — the acting
  `Leader` promotes someone else to `Leader`, which demotes the acting
  `Leader` to `Officer` in the same call. This is the only transfer path in
  v1; there is no separate "transfer leadership" endpoint.

### Treaty lifecycle

- **Propose**: `Leader`/`Officer` of the proposing guild; refused if the pair
  already has a `Proposed` or `Active` treaty (either direction), or the
  proposer is at its treaty cap. A pending proposal counts against the cap.
- **Accept/Reject**: `Leader`/`Officer` of the target guild. Accepting is
  refused if the target guild is itself at its cap.
- **Break**: `Leader` of either guild, on an `Active` treaty only.

## 4. API surface (as implemented)

```
POST   /api/v1/worlds/{worldId}/guilds                          found a guild
GET    /api/v1/worlds/{worldId}/guilds                          list a world's active guilds

GET    /api/v1/guilds/{guildId}                                 guild + roster
GET    /api/v1/guilds/{guildId}/perks                           member cap, treaty cap, perks
POST   /api/v1/guilds/{guildId}/join
POST   /api/v1/guilds/{guildId}/leave
POST   /api/v1/guilds/{guildId}/members/{userId}/kick
PUT    /api/v1/guilds/{guildId}/members/{userId}/role
PUT    /api/v1/guilds/{guildId}/fee-tier
POST   /api/v1/guilds/{guildId}/fee-payment

GET    /api/v1/guilds/{guildId}/board/topics
POST   /api/v1/guilds/{guildId}/board/topics                    kind: discussion | announcement | report
GET    /api/v1/guilds/{guildId}/board/topics/{topicId}
POST   /api/v1/guilds/{guildId}/board/topics/{topicId}/posts

GET    /api/v1/guilds/{guildId}/treaties
POST   /api/v1/guilds/{guildId}/treaties                        propose
POST   /api/v1/treaties/{treatyId}/accept
POST   /api/v1/treaties/{treatyId}/reject
POST   /api/v1/treaties/{treatyId}/break
```

Reads are anonymous; every mutating route requires a real account (unlike
settlement founding, which still allows anonymous play) — a guild membership
is inherently tied to a real `UserId`.

## 5. Explicitly out of scope for this PR (backlog)

Deferred, roughly in the order they'd likely be wanted next:

- **Invites / applications** — v1 join is open (capped only by the member
  cap). No invite-only or apply-to-join recruitment modes yet.
- **Audit log** — no record of kicks, role changes, tier changes, etc.
  beyond structured log lines.
- **Rejoin cooldown** — a kicked or departed member can rejoin immediately;
  there is no membership history to check against (memberships are hard-
  deleted, not soft-left).
- **Scheduled fee collection** — paying is manual; there is no background job
  that charges members automatically or auto-kicks the badly overdue.
- **Guild bank / shared resources** — fees are destroyed (a sink), not
  pooled. A natural next step once this is wanted.
- **Guild-level buildings, tech, or points/ranking**.
- **Real-time guild chat** — the board (topics + replies) is the only
  communication surface.
- **Report embeds** — a `Report`-kind topic is just a flagged topic; there is
  no reports feature yet to render inside it.
- **Trade capacity bonus / unit support perks** — exposed by
  `GET /guilds/{id}/perks` for a future trade/army system to read; nothing
  consumes them yet, because neither system exists.
- **Extended diplomacy** — no NAP-vs-peace distinction, no war declarations,
  no confederations. Only a single peace/no-peace relationship per guild
  pair.
- **Custom roles / permission editor** — three fixed roles only.
- **Guild emblem/heraldry** — name, tag and description only.
- **Multi-guild "families"/wings** — one active membership per account,
  enforced at the database.
- **Frontend UI** — this PR is backend-only (domain rules, EF model,
  service, minimal API endpoints, tests). A guild panel/board UI is a
  separate follow-up.

## 6. Things easy to forget (seen in Travian, Tribal Wars, Ikariam, OGame, …)

A checklist for whoever picks up the backlog above:

- Guild bank / shared resource pool, with contribution and disbursement
  logging (anti-embezzlement).
- Guild-level buildings or research funded by that bank.
- Guild ranking / points, once a per-player score exists.
- Recruitment modes: open / apply / invite-only, with an application queue
  and messages.
- Kicked-member cooldown before they can rejoin the same guild.
- Guild disband confirmation (typed name, or similar) to avoid fat-fingering
  it away.
- Renaming cooldown, to stop identity-swap scams against allies.
- Audit log for every guild-affecting action (kicks, promotions, tier and
  role changes, treaty events) — much cheaper to add now than to backfill.
- Inactivity/last-active surfaced on the roster for officers, even without
  an auto-purge.
- Extended diplomacy: NAP vs. peace, war declarations (relevant once combat
  exists), confederations/multi-guild families — and a policy on whether
  those become a member-cap loophole.
- Guild vs. guild statistics, once combat exists.
- Notification preferences (invite received, kicked, treaty events, etc.).
- Directory search/browse beyond a flat per-world list.
- A pay-to-win guard: keep fees and perks resource-scale and
  convenience-scale (trade/logistics), not power-scale (production or
  combat bonuses) — hold this line once combat ships.
- Board moderation beyond soft delete/lock: rate limits on posting, spam
  reporting to admins.

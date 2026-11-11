# Guild / alliance system

Design for Bjarnoy's guild (alliance) system: a world-scoped group of players
that runs a small message board, and can make peace with other guilds. Drafted with Fable, then scoped down to a buildable
v1 slice for this repo's current state (no trade/market system, no army/unit
system, no invites/applications infrastructure yet).

## 1. Naming

Kept in plain English in the code and wire contracts (`Guild`, `Leader`,
`Officer`, `Member`, `PeaceTreaty`) rather than in-universe Norse
terms — the frontend can still skin these as "Hird" / "Jarl" / "Tithe" /
"Frith Pact" in copy without the backend needing to change. This keeps the
API legible from other tools (OpenAPI, tests) without a glossary.

## 2. Data model (as implemented)

- **`GuildEntity`** — `WorldId`, `Name`, `Tag`, `Description`,
  `CreatedAt`, `DisbandedAt` (soft delete). Name
  and tag are unique per world, not globally — each world is its own
  playthrough.
- **`GuildMembershipEntity`** — `GuildId`, `UserId`, `Role`
  (`Leader`/`Officer`/`Member`), `JoinedAt`. One row per
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

### Fees and fee tiers

Guild fees and fee tiers are off until the guild fee rework. No member pays a
fee and a leader picks no tier. Every guild has the same caps:

| | |
|---|---|
| Member cap base | 10 |
| Max active peace treaties | 1 |

Both live in `GuildRules` (`Bjarnoy.Domain.Guilds`): pure functions, no I/O,
unit-tested directly.

### Member cap

```
memberCap = 10 + floor(highestLonghouseLevel / 2)
```

`highestLonghouseLevel` is the highest Longhouse level across all current
members' settlements in that world (`GuildService.HighestLonghouseLevelAsync`),
recomputed live on every join/caps check rather than cached. The Longhouse is
the only anchor building today; if a dedicated civic building (a "Chieftain's
Hall" or "Meeting Hall") takes over this role later, the intent is that
callers read its level through that one method instead of inlining
`Settlement.LonghouseLevel` at every call site, so the swap is a one-line
change rather than a schema migration.

Losing the member who holds the highest Longhouse can push a guild over its
cap. Nothing is auto-kicked and no treaty
is auto-broken — the guild simply cannot accept new members or propose new
treaties until it is back under the new caps on its own. This "frozen state"
falls out naturally from `JoinAsync`/`ProposeTreatyAsync` checking live caps
rather than needing a separate mechanism.

### Membership lifecycle

- **Found**: any user not already in a guild can found one; the founder
  becomes its `Leader`; the guild starts at `Copper`.
- **Join**: open — no invite/application step in v1. Refused once
  the guild is at its member cap, or the user is already in a guild.
  Decided to change: open join goes away, see "Roles, joining and war" below.
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

The `Officer` role in the rules above is decided to be replaced, see
"Roles, joining and war" below.

### Roles, joining and war (decided, not built yet)

- Roles: Leader, Warmaster, Recruiter, Herald, Member. The Warmaster handles
  diplomacy (peace and war), the Recruiter handles invites and applications,
  the Herald can send a message to all members. These replace Officer.
- A guild recruits by application or by invite only. There is no open join.
- Two guilds have peace, war, or no relation. War is a status like peace: it
  is declared, and it ends only when both guilds agree to end it, which
  returns the pair to no relation.

### Map colours

Realm borders, settlement markers and owner names on the map show how that
realm relates to you: your own realm is blue, realms of your guild's members
are green, realms of guilds your guild has an active peace treaty with are
purple, every other realm is red. Where two realms touch, both borders show
side by side.

The relation comes from the backend as `SettlementSummary.relation`
(`mine` | `guild` | `treaty` | `rival`, see `GET /worlds/{worldId}/settlements`);
the colours live in `src/frontend/src/lib/map/realmColours.ts` and the matching
`--realm-*` CSS variables.

## 4. API surface (as implemented)

```
POST   /api/v1/worlds/{worldId}/guilds                          found a guild
GET    /api/v1/worlds/{worldId}/guilds                          list a world's active guilds

GET    /api/v1/guilds/{guildId}                                 guild + roster
GET    /api/v1/guilds/{guildId}/caps                            member cap, treaty cap
POST   /api/v1/guilds/{guildId}/join
POST   /api/v1/guilds/{guildId}/leave
POST   /api/v1/guilds/{guildId}/members/{userId}/kick
PUT    /api/v1/guilds/{guildId}/members/{userId}/role

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
  cap). Decided: apply or invite only (§3, "Roles, joining and war"); not
  built yet.
- **Audit log** — no record of kicks, role changes, etc.
  beyond structured log lines.
- **Rejoin cooldown** — a kicked or departed member can rejoin immediately;
  there is no membership history to check against (memberships are hard-
  deleted, not soft-left).
- **Guild bank / shared resources** — no shared resources yet. A natural next step once this is wanted.
- **Guild-level buildings, tech, or points/ranking**.
- **Real-time guild chat** — the board (topics + replies) is the only
  communication surface.
- **Report embeds** — a `Report`-kind topic is just a flagged topic; there is
  no reports feature yet to render inside it.
- **Extended diplomacy** — no NAP-vs-peace distinction, no confederations.
  War is decided (§3, "Roles, joining and war") but not built yet.
- **Custom roles / permission editor** — three fixed roles today; the
  decided role set is in §3, "Roles, joining and war".
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
- Audit log for every guild-affecting action (kicks, promotions, role
  changes, treaty events) — much cheaper to add now than to backfill.
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

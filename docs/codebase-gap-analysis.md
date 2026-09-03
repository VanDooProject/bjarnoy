# Codebase gap analysis — Bjarnoy / Fjørdhold

**Date:** 2026-08-29
**Scope:** `src/backend` (.NET 10 / ASP.NET Core / Aspire / EF Core, SQLite + PostgreSQL) and `src/frontend` (Vue 3 + TypeScript + Vite + Pinia + Playwright).
**Method:** independent full-codebase reviews — backend by an Opus subagent, frontend by a Fable subagent — read against `docs/tech/*`, `docs/legacy/*`, and `docs/design/*`, then cross-checked against the 8 currently open pull requests to flag anything already in flight.

Every finding below is a verified read of the code (file:line), not speculation. Findings already covered by an open PR are marked **🔄 in progress (PR #N)**; everything else is unaddressed as of this review.

Open PRs considered: [#73](https://github.com/VanDooProject/bjarnoy/pull/73) (troop frontend phase 2: army dispatch/movement), [#72](https://github.com/VanDooProject/bjarnoy/pull/72) (settler crews / renown / founding a 2nd settlement), [#70](https://github.com/VanDooProject/bjarnoy/pull/70) (guild/alliance frontend), [#69](https://github.com/VanDooProject/bjarnoy/pull/69) (e2e coverage for admin login link), [#57](https://github.com/VanDooProject/bjarnoy/pull/57) (shrines & runes v1), [#54](https://github.com/VanDooProject/bjarnoy/pull/54) (guild/alliance backend), [#49](https://github.com/VanDooProject/bjarnoy/pull/49) (trade system domain layer only), [#21](https://github.com/VanDooProject/bjarnoy/pull/21) (fog-of-war *rendering* bug fixes).

---

## Backend (`src/backend`)

### 1. Architecture gaps

- **No ownership authorization on any game-action endpoint.** `Endpoints/SettlementEndpoints.cs:50,55` (build/train), `Endpoints/ArmyEndpoints.cs:26,47` (dispatch/recall) never check the caller owns the settlement or army — `SettlementService.QueueBuildAsync` and `ArmyService.DispatchAsync` take only an id. Any caller who knows a GUID can spend another player's resources, empty their garrison, or dispatch their army. This is the single biggest security gap found; **no open PR touches it.**
- **Duplicate unauthenticated route bypasses the admin world-state policy.** `AdminWorldEndpoints.cs:37` guards world pause/lock behind `RequireAuthorization("Admin")`, but `SettlementEndpoints.cs:38` exposes the identical state machine at `POST /worlds/{worldId}/state` with no auth at all.
- **World creation is unauthenticated and effectively unbounded-cost.** `WorldEndpoints.cs:28` is public; `WorldGenerationOptions.Validate` allows `Radius` up to 1000 (~3M hexes, full flood-fill + river pass) — a cheap CPU/disk DoS. Legacy design had this admin-only.
- **No rate limiting anywhere** — login/register, chat sends, and world creation are all unthrottled (brute force / enumeration / DoS risk).
- **No optimistic concurrency control** on `SettlementEntity`/`ArmyEntity`/`WorldEntity`, and no explicit transactions anywhere in the codebase — concurrent build/dispatch calls can double-spend resources (last-write-wins).
- **No SQLite concurrency configuration** (`Persistence/DatabaseServiceCollectionExtensions.cs:48`) despite the project's own stated requirement that SQLite support multiple worlds in one container — no WAL mode, no `busy_timeout`; concurrent writers will surface as raw `SQLITE_BUSY` 500s.
- **No resilience/retry on the PostgreSQL provider** (`:43`, no `EnableRetryOnFailure`) — the HTTP client stack gets `AddStandardResilienceHandler` but the database, the only real hosted dependency, gets none.
- **No tenancy boundary expressed anywhere** for the stated multi-tenant PostgreSQL hosting case — isolation is "one DB per deployment" with nothing in the model to enforce it.
- **Background pollers have no leader election/locking** — `LeaderboardService.RefreshCurrentBoardsAsync` does a read-then-write watermark with no lock; two replicas ticking together can double-compute and race a unique index.
- **Refresh tokens are never revoked on ban/lock** (`UserService.SetStatusAsync:155` only sets `Status`), contradicting the entity's own documented intent, and there's no `logout-all` or pruning job.
- **Health checks don't check the database** (`ServiceDefaults/Extensions.cs:91` registers only `"self"`) — an orchestrator will route traffic to a replica whose DB is unreachable.
- **`JwtOptions.ValidateOnStart()` has no validator attached** — a too-short signing key fails later with a crypto error instead of a startup config error.
- **Three different error-response shapes** across endpoints (DataAnnotations `ValidationProblem`, hand-rolled dictionaries, `rejection`-extension `BadRequest<ProblemDetails>`) complicate any generated client.

### 2. Test gaps

- **The entire army/combat/movement API has no integration tests** — dispatch, recall, battle resolution-on-read, battle-report reads, and the `HexListConverter`/`DoubleListConverter` persistence round-trip are only exercised by pure-domain tests. Largest untested surface in the backend.
- **PostgreSQL coverage is 4 tests wide, not "the same suite on both providers"** as `docs/tech/backend.md:102` claims — settlements, armies, chat, auth, leaderboards, and every value converter are never run against Npgsql.
- **`BattleReportService.GetForSettlementAsync` orders by `DateTimeOffset` in SQL** (`:40`) — the exact SQLite anti-pattern the codebase explicitly avoids elsewhere (`WorldService.cs:99`, `LeaderboardService.cs:734`) — and it's untested on either provider.
- **No concurrency tests anywhere** (simultaneous builds/dispatches, racing leaderboard ticks).
- **No test asserts non-owner callers are refused** on any mutating game endpoint (only `AdminWorldEndpoints` and leaderboard "me" scoping are tested this way) — the missing-authz gap above is invisible to the test suite by omission.
- **`GameClock`'s Locked → Paused → Resume chain and `AddGrace` on a running world are untested** at the integration level.
- **River generation's stated collision rules are under-tested** — "a third path stops at an already-full tile" and "a truncated <2-tile path is dropped" (`docs/design/river-generation.md:83-91`) have no covering test.
- **`ChatService.GetConversationsAsync` pagination is never tested at volume** — it loads full history into memory (see Other, below) and no test exercises that at scale.
- **The `--migrate` CLI is untested against PostgreSQL** (only SQLite is covered; Postgres is only reached via in-process `MigrateAsync`, not the CLI mode production actually uses).

### 3. Implementation gaps

- **Battles only resolve when someone reads the *attacking* army.** `ArmyService.SettleAndFoldAsync` is reached only via `GetAsync`/`RecallAsync` on the army; `SettlementService.GetAsync` never checks for incoming armies. A defender who never polls the attacker's army id sees a stale, un-battled garrison indefinitely.
- **Dispatch and fold-home settle resource rates without guest upkeep or terrain**, while `SettlementService`'s own settle path always includes both — the two code paths disagree, and dispatching from a settlement hosting guests silently drops their upkeep from the rate.
- **Auth is roughly half of the design that was explicitly adopted** (`docs/tech/backend-rewrite-decisions.md:122-124`): no email verification, no password reset, no `logout-all`, and `UserEntity` has no `Email` column at all.
- **`LoginAsync` leaks account existence via timing** — unknown-username responses skip the password hash verification and return measurably faster.
- **Registration can claim another anonymous player's settlements** — `OwnerId` is a client-supplied string with no secrecy/signature guarantee; anyone who learns or guesses one takes the settlement on register.
- **Guilds were a bare nullable column with no system.** 🔄 **In progress** — [#54](https://github.com/VanDooProject/bjarnoy/pull/54) adds the full guild/alliance backend (fee tiers, board, member cap, treaties) and [#70](https://github.com/VanDooProject/bjarnoy/pull/70) the matching frontend; both open, stacked, not yet merged.
- **Trade/caravans are entirely absent.** 🔄 **Partially in progress** — [#49](https://github.com/VanDooProject/bjarnoy/pull/49) adds the domain layer only (offers, ratios, cart movement, reports); no Market building, no API wiring, no UI yet per that PR's own scope note.
- **The endboss fires a timestamp marker and nothing else** — `WorldService.TriggerDueEndbossesAsync`'s own remarks say the actual event is out of scope; the seeded `SystemUserIds.Endboss`/`Barbarians` are referenced by nothing.
- **Settlement conquest/capture is unimplemented; razing is partial** — a razed settlement keeps its garrison, doesn't recall guest armies, and buildings falling outside a shrunken claim radius are never re-derived.
- **Rivers are still not wired into the per-tile API** — served only per-island, not per `TileResponse`, matching the design doc's own deferral; the frontend's `worldGenerator.ts` mirror was consequently never written (confirmed independently by the frontend review, below).
- **The premium flag is unreachable outside direct DB access** — no endpoint, including the admin user-update one, can set or clear `IsPremium`.
- **Balance numbers are explicitly placeholder** (unit/building catalogues, flat 5%/level with "no Tower at all") — matches the doc's own stated limitation. 🔄 **Partially addressed** — training now has a real per-unit gate (`UnitDefinition.RequiredBuildingType`/`UnitCatalogue.IsAvailable`'s building-level lookup): land troops need a standing Archery Range and ships a standing Dockyard, not just a longhouse level, mirroring `BuildingDefinition`'s new cross-building prerequisite (`GreatStorehouse` needs its own level-10 Storage House). The Archery Range still carries no combat bonus of its own (deferred, same placeholder-balance caveat as Tower's flat 5%/level).
- **Quarry still has no dedicated sprite in the art pack** — it renders as bare mountain terrain (`buildingArt.ts`/`textures.ts`'s fallback path), the last building type without one now that greathall/storagebuilding/bigstoragehouse/lumberjackhut/thorshrine/freyjashrine/archerybuilding/dockyard have all been wired to real art.
- **Server-side fog of war is not implemented** — `GET /worlds/{id}/tiles` returns full terrain with no visibility filter and no explored/scouted state on any entity, despite the design doc calling out backend-supplied fog as the intended model. [#21](https://github.com/VanDooProject/bjarnoy/pull/21) only fixes *client-side rendering* bugs in the existing (architecturally wrong) client-only fog system — it does not address this gap.

### 4. Other concerns

- **Any caller can read any settlement's full private state** (resources, garrison, queues) and any army's reports/guests with no auth — same root cause as the authorization gap above.
- **Ownership-checking exists and is tested in exactly one place** (`LeaderboardService`'s "me" scoping) — its total absence everywhere else in the game-mutation surface looks like an oversight, not a deliberate anonymous-play tradeoff.
- **`ChatService.GetConversationsAsync` loads a caller's entire message history into memory** before paging in code — a self-inflicted, linear-with-history DoS, acknowledged in its own comment.
- **`ChatService` assumes exactly one recipient per message** (`.Recipients.First()`) despite the schema explicitly modeling many — the first group message will throw or misattribute.
- **World-name uniqueness is a check-then-act race** with no `DbUpdateException` handling (unlike settlement founding, which does this correctly) — a concurrent duplicate name is a 500, not the promised 409.
- **The endboss due-scan filters in memory** after an unindexed load of every world with a pending `EndbossAt`, contradicting its own "cheap indexed query" comment.
- **Admin/user search uses non-sargable `.ToLower().Contains()`** with no supporting index on either provider.
- **`ArmyEntity.Path`/`ReturnPath` are unbounded text blobs** with no `HasMaxLength`, re-serialized in full on every settle.
- **Static-asset caching is a documented, still-open rough edge** (`no-cache` on fingerprinted Vite assets).
- Minor doc/API-shape nits: `ResourcePool`'s own doc comment names the wrong method (`WithRate` vs. actual `TrySpend`), and `Optional<T>` is used inconsistently in the admin PATCH path.
- **`legacy/backend` and `legacy/browsergame` are cleanly detached** — confirmed by grep, nothing in `src/backend` references either tree. Correctly inert, not a gap.

---

## Frontend (`src/frontend`)

### 1. Architecture gaps

- **Fabricated HUD numbers presented as real even in live mode.** `lib/map/WorldModel.ts:234-265` invents population/storage-cap values from longhouse level client-side and `stores/world.ts:342-346` uses them unconditionally — even though the backend already returns a real `resources.capacity` that's never read anywhere outside test fixtures. Live players see numbers that will silently diverge from server truth.
- **No error surface for live-mode failures on the core game views.** `views/SettlementView.vue:474,501` and `views/LandingView.vue:149,175,193` only `console.error` rejected builds/upgrades; `LandingView.vue:34-40` awaits world bootstrap in `onMounted` with no catch at all, so a down backend or a stale settlement id produces an unhandled rejection and a stuck page. The proper pattern (surfacing `ApiError.problem.detail`) exists in `TrainingModal.vue` but isn't applied consistently.
- **Demo/live divergence in the guided-onboarding build action** — the same click places an instant free `'hut'` in demo mode but queues a costed `'farm'` in live mode; e2e only ever sees the demo path.
- **Client-side fog of war contradicts the design's stated server-authoritative intent, and live polling erases it.** `WorldModel.ts:190-192,339-341` + `stores/world.ts:316-334`: `registerSettlement()` unconditionally marks the explored ring, and the 4s rival-refresh poll calls it for every rival, so all rival surroundings become "explored" with no actual scouting. 🔄 [#21](https://github.com/VanDooProject/bjarnoy/pull/21) fixed several *rendering* bugs in this same system (fog stacking order, jitter, perf) but did not change this underlying architecture — matches the backend-side finding that server-supplied fog was never built.
- **Renderer options are captured once, not reactive** — prop changes after mount require views to reach through `defineExpose` and call renderer internals by hand; rendering and Vue state are coupled via an ad-hoc imperative API.
- **No responsive/mobile support at all** — zero media queries, fixed absolute-pixel layouts, wheel-only zoom (no pinch), and Playwright is pinned to a single 1280×800 viewport so nothing exercises smaller screens.
- **Accessibility is near-absent** — two `aria-*` attributes in the whole app; the entire game surface is one pointer-only canvas with no keyboard alternative; nav uses `<button>`+`router.push` instead of `<router-link>` (no middle-click/open-in-tab).
- **Hand-written API types carry real drift risk** — the intended `openapi-typescript` generation step is not wired up; enum-like fields are bare `string`, and wire strings get unchecked casts into narrow unions (`as TileOrientation[]`, `as Tile['buildingType']`); `api.queueBuild` returns `request<unknown>`, discarding its response contract.
- **World-creation race is handled client-side by any anonymous visitor** — whichever tab loads first `POST`s the shared world into existence with a 409-retry, despite the code's own comment saying this is "meant to be created by an admin". Mirrors the matching backend gap (unauthenticated `POST /worlds`).
- **Inconsistent store error/loading conventions** — `stores/world.ts`, the most logic-dense store, has no loading/error state at all; catalogue stores declare an `error` field that's never assigned.

### 2. Test gaps

- **`stores/world.ts` (369 lines: join/create/409 race, spacing logic, poll lifecycle) has zero unit tests**, as do `stores/auth.ts` (refresh/rotation/lock) and `stores/player.ts` — while much simpler stores are thoroughly tested.
- **No frontend test pins `worldGenerator.ts` against the backend's "bit-exact port" claim** (`docs/tech/backend.md:141-143`) — no shared seed→tiles golden fixture, so the two could silently desync.
- **`HexMapRenderer.ts` (2,043 lines) and `lib/hex/coords.ts` have no unit tests** — camera math, culling, fog geometry, and axial-coordinate primitives are only exercised indirectly via screenshot-diff e2e.
- **The entire e2e suite runs demo mode only** (`vite preview`, no backend) — this is explicitly acknowledged in [#70](https://github.com/VanDooProject/bjarnoy/pull/70)'s own description as an unresolved gap ("a true through-the-browser guild flow... would need a `Bjarnoy.AppHost.Tests`-style live-orchestration test... Flagging this as a gap rather than silently skipping it"). Everything gated on live-only code (build queueing, training, reload restore, join-blocked states) has no browser coverage. 🔄 [#69](https://github.com/VanDooProject/bjarnoy/pull/69) adds one such live-orchestration test, but only for the admin-login-link flow — it's the first instance of this pattern, not a general fix.
- **No e2e coverage for login/register, profile, admin, or tech-tree flows.**
- **Fixed sleeps in ring-menu and drag specs are flake-prone** — `waitForTimeout(150/80/250/300)` calls and a pixel-offset probing loop, despite the suite elsewhere using `data-map-ready`/`expect.poll`; per this repo's own CLAUDE.md/AGENTS.MD guidance, the accompanying `test.setTimeout` escalation to 90-120s is compensating for real cost rather than a broken-selector fix.
- **e2e's founding helper hard-codes UI layout math** (`0.5 + 0.16` of viewport width) duplicating `LandingView.vue`'s bias constant by hand — any layout tweak silently breaks nearly every spec.
- **Error-state coverage is one-sided** — no unit or e2e test for build/upgrade rejection, `bootstrapLiveWorld` failure, or catalogue-fetch-failure fallback in live mode.

### 3. Implementation gaps

- **Backend systems with no frontend counterpart: combat/battle reports, chat.** The API has full army-dispatch/battle-report and chat endpoints/contracts with no matching client code, view, or panel; the HUD's "Reports" and "Alliance" nav items are explicitly disabled (`title="Not implemented yet"`) and Attack/Raid is permanently disabled in the ring menu. 🔄 **Partially in progress** — [#73](https://github.com/VanDooProject/bjarnoy/pull/73) adds the army-dispatch/movement half of this (garrison, waypoints, live position rendering, recall); battle reports and chat UI remain untouched by any open PR.
- **World map is still single-player scaffolding in live mode** (per the frontend's own README) — any hex click, rival or open sea, routes straight to `/settlement`; `WorldModel.addFleet` has no caller. 🔄 **Partially in progress** — [#72](https://github.com/VanDooProject/bjarnoy/pull/72) adds a second-settlement flow (settler crews, renown, founding) and an `ExpansionPanel.vue` for switching between owned settlements, which is the first real multi-settlement UI; open, not yet merged.
- **Raze is demo-only** (no backend endpoint) and **demo "upgrade" just increments a local counter with no cost or timer**, so demo-mode economy behavior diverges meaningfully from live.
- **Rivers render only in live mode** — `worldGenerator.ts` never received the river-generation mirror the design doc defers, so demo mode (what `npm run dev` and all of e2e actually see) never shows rivers.
- ~~**`BuildQueuePanel.vue` shows a fabricated "X / Y slots"**~~ — ✅ **Closed by [#158](https://github.com/VanDooProject/bjarnoy/issues/158).** Construction slots are now a real backend concept (`Settlement.ConstructionSlots = 2 + max(0, (longhouseLevel − 5) / 5)`, `SettlementResponse.construction`), `BuildOrder` stores a real `StartedAt`/`CompletesAt` for a started order (no more percent-complete approximation), multi-slot buildings exist (a Longhouse upgrade occupies every slot), and premium settlements get a real waiting queue with reserved-but-spendable-nowhere-else resources (`ResourcesResponse.reserved`/`.available`). See `docs/design/construction-slots.md`.
- **Dead API client surface** — `api.getWeeklyStats`/`getProfile` and their response types have no consumer.
- **The "Landing" nav item is a silent no-op** for onboarded players — the router guard bounces them straight back to `/settlement`.
- **`BuildingModal`'s empty-tile fallback always builds a `'hut'`**, which the code's own comment says has no backend catalogue entry and is expected to be server-rejected — a guaranteed dead-end interaction, and the rejection is then swallowed by the silent-catch gap above.

### 4. Other concerns

- **Per-frame marker/label rebuild does real geometry work every tick** even though camera/state are frequently unchanged — `rebuildSettlementLabels()` scans dozens of hexes per visible settlement per frame; this is the standing cost the e2e timeout escalations (above) are absorbing.
- **`distanceBeyondExplored` and the 4-second rival-refresh poll are both O(settlements)** per fog rebuild / per tick — fog rebuild cost grows linearly with world population on every pan, and `refreshWorldSettlements` redundantly re-registers every rival (and resets `foundedAt`) every 4s.
- **Demo resource tick ignores its own displayed cap** — stock accrues unboundedly while the resource bar clamps its fill at 100%.
- **Duplicated magic numbers between `RingMenu.vue` and `SettlementView.vue`** (radius, bubble-angle formula) kept in sync only by comment, plus one dead commented-out line in `HexMapRenderer.ts`.
- **`window.__demoWorld`/`__settlementRenderer` test hooks bypass the UI they nominally cover** — e2e specs drive `WorldModel.placeBuilding` directly through untyped (`any`) globals rather than exercising the click-to-build path, and won't fail compilation when the model's API changes.
- **Refresh token lives in `localStorage`**, acknowledged as an XSS tradeoff in comments — worth flagging given the profile bio field is explicitly designed to carry free-form ASCII-art content, widening the same page's XSS surface.

---

## Cross-cutting notes

- **Authorization is the single most important gap on both sides of the stack**, and it's the same gap seen twice: the backend has no per-request ownership check on any game-mutation endpoint, and the frontend's world-creation race exists precisely because there's no admin-only boundary to defer to. 🔄 **In progress** — a follow-up PR adds `SettlementOwnershipEndpointFilter`/`ArmyOwnershipEndpointFilter` (a JWT check for a claimed settlement, an `X-Owner-Id` header for anonymous play) on build/train/dispatch/recall, removes the frontend's client-side `createWorld()` call entirely, closes the `WorldService.CreateWorldAsync` race with the same try/catch pattern `SettlementService.FoundAsync` already uses, and (added once removing client-side creation broke the live full-stack e2e suite, which founds a settlement through a fresh, real frontend with no world yet to join) seeds one default world at startup for any app instance that migrates itself — `WorldService.SeedDefaultWorldIfNoneAsync`, called from `Program.cs` right after `DatabaseMigrator.MigrateAsync()`. Deliberately **not** in that PR: locking `POST /worlds` itself behind the `Admin` policy — doing so still touches world-creation test fixtures in ~10 integration test files (the startup seed only covers "a world exists to join," not "only an admin may create more"), called out there as a separate follow-up rather than folded in; and the broader "any caller can read any settlement" gap, which this only gates mutations against.
- **Fog of war** is a good example of a gap that looks "handled" from PR activity alone but isn't: #21 (open) fixes real rendering bugs in the *existing* system, but both independent reviews — backend and frontend — separately concluded the underlying design (server computes visibility, client renders it) was never built. Landing #21 will not close this gap.
- **Guild/alliance and settler-expansion features are the two areas furthest along** relative to what's flagged here — #54+#70 (guilds) and #72 (settler expansion) are open PRs actively closing implementation gaps that would otherwise appear in this list; they weren't double-counted as new findings.
- **Trade** and **combat-adjacent frontend UI** (battle reports, chat) are the two biggest remaining "backend/design intent exists, nothing built or wired" gaps with no PR in flight for the missing half (#49 covers trade's pure domain layer only; #73 covers army movement but not combat feedback).

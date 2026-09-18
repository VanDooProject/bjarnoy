# Push notifications: Web Push (VAPID) + service worker, per-type opt-outs, per-device subscriptions

## Problem

1. Nothing in Fjørdhold reaches a player who does not have a tab open. Every
   "something happened" signal is pull-based today: `stores/reports.ts` polls
   battle/trade/field reports every `REPORT_POLL_MS = 5000` while a HUD nav is
   mounted, `MessagesView.vue`/`ConversationView.vue` fetch on mount, and the
   build/training queue only advances when the client asks for the settlement
   snapshot. A player who queues a 6-hour longhouse upgrade, closes the laptop
   and gets attacked at 03:00 learns about both the next time they open the
   site.
2. There is no real-time channel of any kind — no SignalR, no WebSocket, no
   SSE, no outbox, no PWA layer (no manifest, no service worker, no
   `vite-plugin-pwa`; `index.html` links only `favicon.svg`). Push delivery is
   a wholly new capability, not an extension of an existing one.
3. The backend is deliberately lazy (`docs/tech/backend.md`, "Everything is
   lazy": *"Nothing in this backend ticks... A build order is a completion
   instant; it is done when that instant has passed."*). A build completing,
   an army arriving, a shipment landing are not events that *occur* server-side
   — they are facts that become true and are materialised on the next read
   (`SettlementEntity.ToDomain().SettleTo(now)`, `ArmyService` lines ~780–801
   resolving an in-transit army only when it is next loaded). A push
   notification is by definition something that must happen *without* a read.
   This is the central design tension of the feature, and the reason the plan
   contains a scheduler, not just a "send on event" hook.
4. Requirements (from the issue): (a) works on mobile and desktop browsers,
   (b) a settings page to disable individual notification types, (c) one
   account may be subscribed from several devices at once, each individually
   revocable.

## Existing constraints and precedents (verified in code — the plan builds on these, not around them)

- **Identity**: only real accounts (`UserEntity`, `Bjarnoy.Infrastructure/Entities/UserEntity.cs`)
  get push. The legacy anonymous `OwnerId` (`X-Owner-Id`, client-generated
  localStorage id) is untrusted and cannot own a server-side subscription
  safely. `UserEntity.Status` (`Active`/`Locked`/`Banned`) and
  `ActiveUserEndpointFilter` gate mutating calls; push dispatch must honour the
  same gate.
- **Per-user one-to-many, independently revocable rows**: `RefreshTokenEntity`
  (`Id` UUIDv7, `UserId` FK cascade, `RevokedAt`, `CreatedAt`; configured in
  `GameDbContext.OnModelCreating` as table `refresh_tokens` with
  `ValueGeneratedNever()` and a unique index on `TokenHash`). Push
  subscriptions copy this shape exactly.
- **User preference precedent**: `UserEntity.PreferredLocale` (nullable,
  `HasMaxLength(10)`), written by `PUT /api/v1/profiles/me/locale`
  (`ProfileEndpoints.UpdateOwnLocale` → `ProfileService.UpdateLocaleAsync`,
  validated against `ProfileService.SupportedLocales`). `PreferredLocale` is
  also what the server will use to localise notification text.
- **Background workers**: `Bjarnoy.Api/Hosting/EndbossTriggerHostedService.cs`
  (30 s `PeriodicTimer`, waits one tick before the first poll so tests'
  migrator has run, scoped service per tick, catches-and-logs per tick, the
  real scan lives in `WorldService.TriggerDueEndbossesAsync` so tests drive it
  directly). Registered in `Program.cs` inside the "not the migrator" branch
  next to `WeeklyAggregationHostedService` and
  `UserActivityRetentionHostedService`. This is *the* shape for both new
  hosted services below.
- **Time**: `TimeProvider` is injected everywhere (`builder.Services.AddSingleton(TimeProvider.System)`);
  integration tests swap it for `Infrastructure/TestTimeProvider.cs` and
  `Advance(...)`. Everything time-based in this plan is testable by advancing
  that clock.
- **Time-based facts already stored as columns**: `BuildOrderEntity.CompletesAt`
  (nullable — null until the order reaches the head of the queue, set by
  `SettleTo`), `TrainingOrderEntity` (own `StartedAt`/completion),
  `TradeEntity.ArrivesAt` ("Cached `Movement.ArrivesAt`, for filtering due
  shipments without recomputing every row" — the precedent for caching an
  arrival instant purely so a scan can filter on it), `ArmyEntity.DepartedAt`
  / `TurnAroundAt` (arrival is currently derived, not cached — see step 2b).
- **Synchronous, genuinely server-side events**: `ChatService` writes
  `MessageEntity` + `MessageRecipientEntity`; `BattleReportService` /
  `FieldBattleReportService` write reports at resolution time; guild board
  posts and `GuildPeaceTreatyEntity` proposals are written by `GuildService`.
  These are the only events that can be pushed "at the moment they happen";
  everything else needs the scanner.
- **Migrations**: `dotnet ef migrations add <Name>` once per provider
  (`docs/tech/backend.md` lines 91–95); CI fails if either snapshot drifts.
  Enums are stored as `int` (`FeeTier.HasConversion<int>()`), table names are
  snake_case.
- **Frontend serving**: production is one container, `app.UseDefaultFiles()`
  + `MapFallbackToFile("index.html")` serving the built Vue app from
  `wwwroot` (`Program.cs` ~309–322). A `public/sw.js` therefore lands at
  `/sw.js` on the same origin as `/api`, with root scope, in both `vite` dev
  and production. HTTPS is required for push in production; `localhost` is a
  secure context for dev.
- **Frontend tests**: vitest + jsdom for components (`ProfileView.test.ts`,
  `HudNav.test.ts`), Playwright e2e against `vite preview` with a *mocked*
  API (`e2e/fixtures.ts` "mocked authenticated session"). Access tokens are
  in-memory only; the refresh token is in `localStorage` (`stores/auth.ts`).
  A service worker therefore never has an access token — this shapes the
  resubscribe design below.

## Architecture decision

**Web Push (RFC 8030 + VAPID RFC 8292 + `aes128gcm` payload encryption) via
each browser's push service, received by a service worker.** No native app.

Why this and not the alternatives:

| Option | Verdict | Reason |
|---|---|---|
| Native app / store wrapper (Capacitor, TWA) | **Not now** | There is no native app and the game is a canvas SPA; wrapping it buys iOS reliability only, at the cost of store accounts, review cycles, a second build pipeline and a second permission model. Revisit in phase 4 only if iOS engagement data says Home-Screen install is too much friction (see Risks). |
| SignalR / WebSocket | **Not for this** | Only reaches an open tab; a WebSocket can't wake a closed browser. Worth adding *later* for in-tab live updates (replacing the 5 s report poll), but it is orthogonal to this feature and must not be bundled into it. |
| SSE | Same as above | Same "open tab only" limitation. |
| Email digests | Complementary, out of scope | No mail infrastructure exists; the issue asks for push. |

Web Push works on Chrome/Edge/Firefox/Opera desktop and Android, Safari on
macOS 16+, and Safari on iOS/iPadOS 16.4+ *only when the site is installed to
the Home Screen* — which is why a minimal PWA manifest is a hard prerequisite,
not polish. The browser's push service (FCM, Mozilla autopush, Apple) does the
waking; our server only ever talks HTTPS to that service, signed with our
VAPID key pair.

Server-side library: **`Lib.Net.Http.WebPush`** (tpeczek) — actively
maintained, `HttpClient`-based, registers via DI (`AddPushServiceClient`),
supports VAPID and `aes128gcm`, surfaces push-service HTTP status codes
(`PushServiceClientException.StatusCode`) so `404`/`410` can be handled
precisely. Preferred over `WebPush` (web-push-csharp), which is older and has
no DI story. Wrap it behind our own `IPushSender` interface so tests never
touch it and the choice stays swappable.

Guiding rules that fall out of the lazy-backend constraint:

1. **Every notification goes through one outbox table.** Synchronous events
   (message sent) and scheduled facts (build completes at T) both become an
   outbox row; one delivery worker drains it. This gives retry, dedupe,
   per-type TTL, and a single place to apply preferences and the
   `Status == Active` gate.
2. **Time-based notifications are produced by a scanner that calls the
   existing lazy settle code**, exactly as `EndbossTriggerHostedService` calls
   `WorldService.TriggerDueEndbossesAsync`. The scanner never reimplements
   completion; it finds "settlements/armies with something due" and settles
   them through `SettlementService`/`ArmyService`, which is where the
   enqueue calls live. This keeps *one* code path for "a build finished"
   regardless of whether a read or the scanner triggered it.
3. **Server renders the text.** Payload = `{type, title, body, url, tag}`,
   localised with `UserEntity.PreferredLocale` (fallback `en`). The service
   worker stays dumb and tiny (no i18n bundle inside it).
4. **Subscriptions belong to accounts, never to `OwnerId`.** Anonymous
   visitors see a "create an account to get notified" hint instead of a
   toggle.

## Data model

Three new tables, one migration (`AddPushNotifications`), all three created in
phase 1 even though the opt-out table is only *used* from phase 2 — one
migration pair (Sqlite + PostgreSql) instead of two, and the table is
trivial.

### `push_subscriptions` — `PushSubscriptionEntity` (new file `Bjarnoy.Infrastructure/Entities/PushSubscriptionEntity.cs`)

| Column | Type | Notes |
|---|---|---|
| `Id` | `Guid` UUIDv7, `ValueGeneratedNever()` | same as `RefreshTokenEntity` |
| `UserId` | `Guid` FK → `users`, cascade | one user → many devices; `UserEntity.PushSubscriptions` nav list |
| `Endpoint` | `string`, max 2048, required | the push-service URL; **unique index** (a browser has exactly one subscription per origin, so one row per browser install) |
| `P256dh` | `string`, max 256, required | client public key (base64url) |
| `Auth` | `string`, max 64, required | client auth secret (base64url) |
| `DeviceLabel` | `string`, max 60, required | client-derived default ("Chrome on Android"), user-editable in phase 3 |
| `UserAgent` | `string?`, max 512 | raw UA at subscribe time, for the device list tooltip |
| `PreferredLocale` | *not stored* | read from the user at send time |
| `CreatedAt` | `DateTimeOffset` | |
| `LastSeenAt` | `DateTimeOffset` | touched by the client's reconcile-on-open (phase 3); lets an admin/retention job drop dead devices later |
| `LastDeliveredAt` | `DateTimeOffset?` | last successful send |
| `FailureCount` | `int` | consecutive non-410 failures; row is deleted at a threshold (5) |

No `RevokedAt`: revocation is a hard delete. A refresh token keeps its row so
reuse can be detected; a push subscription has no such reuse semantics and
the browser-side `PushSubscription` object is the only other copy.
`OnDelete(Cascade)` from `users` like `RefreshTokens`.

Index: `(UserId)` for the device list; unique `(Endpoint)`.

### `notification_opt_outs` — `NotificationOptOutEntity`

| Column | Type |
|---|---|
| `UserId` | `Guid` FK → `users`, cascade |
| `Type` | `NotificationType` (int) |

Composite PK `(UserId, Type)`. **Absence = enabled.** Chosen over (a) a
per-user JSON column and (b) a row-per-(user,type,enabled) matrix because:

- default-on for every existing *and future* type with zero backfill — adding
  a `NotificationType` value is a code change, never a migration or data fix;
- the dispatcher's filter is one SQL `NOT EXISTS`, no JSON parsing on either
  provider (SQLite and Postgres disagree on JSON operators);
- it matches the requirement literally ("disable specific types") — users
  store what they turned *off*.

Per-user, not per-device. "Only messages on my phone, everything on my
laptop" is a plausible later ask but doubles the UI surface; deferred (Open
question 3).

### `notification_outbox` — `NotificationOutboxEntity`

| Column | Type | Notes |
|---|---|---|
| `Id` | `Guid` UUIDv7 | |
| `UserId` | `Guid` FK → `users`, cascade | the recipient |
| `Type` | `NotificationType` (int) | |
| `DedupeKey` | `string`, max 200, **unique index** | e.g. `build-complete:{orderId}`, `message:{messageRecipientId}`, `battle-report:{reportId}:{userId}` — inserting the same event twice is a no-op (catch the unique violation via a pre-check `AnyAsync` + swallow the race) |
| `PayloadJson` | `string`, max 2000 | the server-rendered `{title, body, url, tag}`; small, already localised |
| `ScheduledFor` | `DateTimeOffset` | `now` for immediate events; lets the queue-head build order be scheduled precisely (step 2b) |
| `ExpiresAt` | `DateTimeOffset` | per-type TTL; also sent as the Web Push `TTL` header |
| `Attempts` | `int` | |
| `SentAt` | `DateTimeOffset?` | null = pending; rows with `SentAt != null` older than 7 days are pruned by the same worker |
| `LastError` | `string?`, max 500 | |

Index `(SentAt, ScheduledFor)` for the worker's "due & unsent" query.

### `NotificationType` enum (new file `Bjarnoy.Domain/Notifications/NotificationType.cs`)

Stored as int → **append-only, never renumber**, same rule as
`ReportSourceType`. Values are grouped with gaps so later additions land next
to their kin.

Also a `NotificationCatalogue` (same file/namespace) that maps each type to
its `Group`, default TTL, and collapse-`tag` strategy — a static table like
`BuildingCatalogue`, so the frontend can render the settings page from
`GET /api/v1/notifications/types` instead of hard-coding the list twice.

## Notification-type taxonomy

Grouped as the settings page will show them. "Verified" = the producing
entity/service exists today; "inferred" = a plausible feature of this genre
that the codebase does not have yet, listed so the enum leaves room, **not**
scheduled for implementation here.

| Type | Group | Trigger source | Status |
|---|---|---|---|
| `BuildCompleted` (10) | Settlement | `BuildOrderEntity.CompletesAt` reached; enqueued from `Settlement.SettleTo` consumer in `SettlementService` | verified |
| `TrainingCompleted` (11) | Settlement | `TrainingOrderEntity` completion, same path | verified |
| `StorageFull` (12) | Settlement | `ResourcePool` stock reaches `Capacity` — computable as `(capacity − stock)/rate` at settle time | inferred (the pool exists; the notification is new) — phase 4 |
| `SettlementSlotUnlocked` (13) | Settlement | `RenownAccount` crossing a `RenownThresholds` value | inferred — phase 4 |
| `BattleReport` (20) | Reports | `BattleReportEntity` written by `ArmyService.ResolveBattleAsync` — one row to attacker *and* defender | verified |
| `FieldBattleReport` (21) | Reports | `FieldBattleReportService` (interceptions, issue #206) | verified |
| `TradeReport` (22) | Reports | shipment `ArrivesAt` reached (`TradeService`, `TradeEntity.ArrivesAt` scan) | verified |
| `IncomingAttack` (23) | Reports | an enemy army in transit *towards* one of my settlements — only if the game exposes incoming movements to the defender | inferred (visibility rules unknown) — phase 4, needs design |
| `DirectMessage` (30) | Social | `MessageRecipientEntity` insert in `ChatService` | verified — **phase 1's proof type** |
| `GuildBoardPost` (31) | Social | `GuildBoardPostEntity` insert, fan-out to guild members except author | verified |
| `GuildTreatyProposed` (32) | Social | `GuildPeaceTreatyEntity` with `Status == Proposed`, to target guild's leaders | verified |
| `GuildMembership` (33) | Social | joined/kicked/invited — depends on what `GuildService` actually emits | verified table, event surface to confirm at implementation |
| `WorldEndboss` (40) | World | `WorldService.TriggerDueEndbossesAsync` firing, fan-out to every user with a settlement in that world | verified |
| `AccountStatusChanged` (50) | Account | `UserService.SetStatusAsync` (locked/unlocked) | verified; **not opt-out-able** — moderation notices always deliver |

The issue's three examples map to `BattleReport`/`FieldBattleReport`/
`TradeReport` ("reports" in this codebase means the `ReportsView` inbox, not
`ReportEntity` moderation reports — those are admin-only and never pushed to
players), `DirectMessage` ("messages"), and `BuildCompleted`
("finished buildings").

Collapse tags (Web Push `tag` in the payload; a newer notification with the
same tag replaces the older one on the device): `build:{settlementId}`,
`training:{settlementId}`, `message:{senderUserId}`, `reports:{userId}`,
`guild:{guildId}`. TTLs: builds/training 1 h (stale by then), messages 24 h,
reports 24 h, endboss 6 h, account 7 d.

## Backend design

### New services (`Bjarnoy.Infrastructure/Services/Notifications/`)

- `IPushSender` + `WebPushSender` — thin wrapper around
  `PushServiceClient.RequestPushMessageDeliveryAsync`; maps outcomes to
  `PushSendResult { Delivered | Gone | Throttled | TransientFailure(string) }`.
  `Gone` covers push-service `404`/`410`. Only this class references the
  NuGet package.
- `NotificationEnqueuer` (scoped) — `EnqueueAsync(Guid userId, NotificationType type, NotificationPayload payload, string dedupeKey, DateTimeOffset? scheduledFor = null)`.
  Looks up `PreferredLocale`, renders text via `NotificationTextRenderer`,
  writes the outbox row within the caller's `DbContext` unit of work (same
  `SaveChanges` as the domain write → an event is enqueued iff the thing
  really happened). Skips silently when the user has no subscriptions or has
  opted the type out — checked at enqueue *and* at send, because a preference
  can change in between.
- `NotificationTextRenderer` — `en`/`de` string tables in
  `Bjarnoy.Infrastructure/Services/Notifications/Texts/*.resx` (or a static
  dictionary — `.resx` is the .NET idiom and vue-i18n's keys can mirror it).
  Deep-link `url`s: `/settlement`, `/reports/{id}`, `/messages/{userId}`,
  `/guild`, `/profile`.
- `PushDeliveryService` (scoped) — `DeliverDueAsync(CancellationToken)`:
  select up to 100 outbox rows with `SentAt == null && ScheduledFor <= now && ExpiresAt > now`,
  join user (skip unless `Status == Active`), skip if opted out, load the
  user's subscriptions, send to each; on `Gone` delete that subscription; on
  `Throttled`/`TransientFailure` bump `Attempts`, retry next tick, give up
  (mark `SentAt` + `LastError`) after 5 attempts; increment/reset
  `FailureCount` per subscription. Also expires stale rows and prunes sent rows
  older than 7 days. Testable head-on like `TriggerDueEndbossesAsync`.
- `DueCompletionScanner` (scoped) — `SettleDueAsync(CancellationToken)`:
  1. settlements with any build order `CompletesAt <= now` or any training
     order due → load and run the *existing* settle path
     (`SettlementService`'s read/settle helper — the one the snapshot endpoint
     uses), which is where `NotificationEnqueuer` is called for each completed
     order;
  2. armies in transit with cached `ArrivesAt <= now` → `ArmyService`'s
     existing load-and-resolve path (which already calls
     `ResolveBattleAsync`/`FieldBattleService.TryResolveAsync`, lines ~780–801),
     with report creation enqueueing `BattleReport`/`FieldBattleReport`;
  3. trade shipments `ArrivesAt <= now` not yet reported → the existing
     due-shipment path in `TradeService` (~line 358).
  Every branch is "find due, call the code that already exists". Requires
  adding a cached `ArrivesAt` column to `ArmyEntity` following
  `TradeEntity.ArrivesAt`'s precedent (a second small migration
  `AddArmyArrivesAt`, phase 2) — without it the scan would have to
  rehydrate every army's `Movement` to know whether it is due.

### Hosted services (`Bjarnoy.Api/Hosting/`)

- `PushDeliveryHostedService` — `PollInterval = 5 s`, copies
  `EndbossTriggerHostedService` verbatim (wait first tick, scope per tick,
  log-and-continue), calls `PushDeliveryService.DeliverDueAsync`.
- `DueCompletionScannerHostedService` — `PollInterval = 30 s`, calls
  `DueCompletionScanner.SettleDueAsync`. 30 s is the notification latency
  ceiling for time-based types; acceptable for a game measured in hours.

Both registered in `Program.cs` next to the existing three, inside the same
"not the migrator" branch, and only when `PushOptions` is configured (see
below). Note the docs claim "the one active poll" — `docs/tech/backend.md`'s
"Everything is lazy" section gets a paragraph explaining that push
notifications are the second, deliberate exception and *why* (a notification
is a side effect that must occur without a reader).

### Configuration and secrets

`PushOptions` (`Bjarnoy.Api/Hosting/PushOptions.cs`, bound from `Push`):
`VapidPublicKey`, `VapidPrivateKey`, `Subject` (`mailto:` or the site URL).
Precedent: `JwtOptions` with a committed dev-only `Jwt:SigningKey` in
`appsettings.Development.json`. Follow it: a committed **dev-only** VAPID pair
in `appsettings.Development.json` (it can only push to subscriptions created
against localhost), production values via environment
(`Push__VapidPrivateKey`) — an Aspire `AddParameter("vapid-private-key", secret: true)`
in `AppHost.cs` next to `postgres-password`, and a Coolify secret in the
deployed app. Startup rule: all three set → feature on; none set → feature
off (endpoints return `404`, hosted services not registered, frontend hides
the settings section because `GET /notifications/config` says
`enabled: false`); partially set → throw at startup, like a missing JWT key.
Generate the pair once with `npx web-push generate-vapid-keys` (or the
library's `VapidHelper`); document in `docs/tech/backend.md`. **Rotating the
key invalidates every subscription** (browsers bind the subscription to the
application server key) — treat it as a never-rotate secret unless leaked.

### Endpoints (`Bjarnoy.Api/Endpoints/NotificationEndpoints.cs`, contracts in `Contracts/NotificationContracts.cs`)

Group `/api/v1/notifications`, tag `Notifications`, all `RequireAuthorization()`
+ `ActiveUserEndpointFilter` + `UserActivityEndpointFilter` except the first.

| Method | Route | Body / result | Notes |
|---|---|---|---|
| `GET` | `/config` | `{ enabled, vapidPublicKey }` | anonymous; the SW subscribe call needs the key |
| `GET` | `/types` | `[{ type, group, optOutAllowed }]` | catalogue for the settings page (phase 2) |
| `GET` | `/subscriptions` | `[{ id, deviceLabel, userAgent, createdAt, lastSeenAt, lastDeliveredAt }]` | own devices only; **endpoint/keys never returned** |
| `PUT` | `/subscriptions` | `{ endpoint, p256dh, auth, deviceLabel, userAgent }` → `201 {id,...}` or `200` on update | upsert keyed on `endpoint`; if the endpoint already belongs to *another* user (shared device, account switch) the row is re-parented to the caller — a browser install has exactly one subscription and whoever is logged in owns it |
| `PATCH` | `/subscriptions/{id}` | `{ deviceLabel }` | phase 3 |
| `DELETE` | `/subscriptions/{id}` | `204` / `404` | own rows only — `404` for another user's id, never `403` (don't leak ids) |
| `POST` | `/subscriptions/{id}/test` | `202` | enqueues a `DirectMessage`-typed "Test notification" row with dedupe key `test:{id}:{ticks}`; the phase-1 proof and a permanent troubleshooting aid; rate-limit 1/min per subscription |
| `GET` | `/preferences` | `{ disabledTypes: NotificationType[] }` | phase 2 |
| `PUT` | `/preferences` | `{ disabledTypes: [...] }` → `200` | replaces the opt-out set; rejects types with `optOutAllowed == false` via `ValidationProblem`, mirroring `UpdateOwnLocale`'s `InvalidLocale` shape |

`AuthEndpoints` logout (`POST /auth/logout`) gains an optional
`pushEndpoint` field: the client passes its current endpoint so the row is
deleted in the same call (a logged-out device must stop receiving another
account's notifications). `UserService.SetStatusAsync(Banned)` deletes all
of the user's subscriptions; `Locked` keeps them (the account can still log
in) but the dispatcher's `Status == Active` check stops delivery.

### Event hooks (where `NotificationEnqueuer.EnqueueAsync` is called)

- `ChatService.SendAsync` → per recipient, `DirectMessage`, key
  `message:{recipientRowId}`, body = truncated message text (80 chars),
  `url=/messages/{senderUserId}`. **Phase 1.**
- `SettlementService` settle path → for each order that transitioned to
  complete, `BuildCompleted`/`TrainingCompleted`, key `build:{orderId}`. The
  key is what makes the dual trigger (a read *or* the scanner) safe.
- `BattleReportService`/`FieldBattleReportService` create → `BattleReport` to
  each involved user, key `battle-report:{reportId}:{userId}`.
- `TradeService` due shipment → `TradeReport`, key `trade:{shipmentId}`.
- `GuildService` board post / treaty proposal / membership → keys
  `guild-post:{postId}:{userId}` etc.
- `WorldService.TriggerDueEndbossesAsync` → `WorldEndboss`, fan-out.
- `UserService.SetStatusAsync` → `AccountStatusChanged`.

## Frontend design

### PWA shell (prerequisite, tiny)

- `src/frontend/public/manifest.webmanifest`: `name: "Fjørdhold"`,
  `short_name`, `start_url: "/"`, `display: "standalone"`, theme/background
  colours from `style.css` tokens, icons 192/512 PNG generated from
  `favicon.svg` (plus a 180 px `apple-touch-icon`). No offline caching, no
  workbox — this is *not* an offline PWA, only the minimum iOS needs to allow
  push after Home-Screen install.
- `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`,
  `<meta name="theme-color">`, `<link rel="apple-touch-icon">`.
- `src/frontend/public/sw.js` — plain JS (not bundled; served at root scope
  by both `vite` and `wwwroot`), ~60 lines, three handlers:
  - `push`: `event.data.json()` → `showNotification(title, { body, tag, data: { url, type }, icon, badge, renotify: false })`;
  - `notificationclick`: close, then focus an existing client whose URL
    matches, else `clients.openWindow(data.url)`;
  - `pushsubscriptionchange`: best-effort — re-subscribe with the stored
    application server key (kept in `self.registration`'s IndexedDB store at
    subscribe time) and `PUT /api/v1/notifications/subscriptions` *cannot*
    succeed here (no access token in the SW) → instead write a
    `pendingResubscribe` flag to IndexedDB; the app reconciles on next open
    (below). Modern browsers fire this event rarely, so the reconcile pass is
    the real mechanism.
  No `fetch` handler at all (an SW that doesn't intercept fetch can't break
  loading of the Pixi atlases or the Vite dev server).
- `main.ts`: `navigator.serviceWorker.register('/sw.js')` guarded by
  `'serviceWorker' in navigator`, after app mount. Registration alone shows
  no prompt and costs nothing.

### `src/frontend/src/push/` module

- `capability.ts`: `pushSupport(): 'supported' | 'needs-install' | 'unsupported'`
  — detects `PushManager`/`Notification`, and the iOS case (`navigator.standalone === false`
  on an iOS UA → `'needs-install'`, rendered as "Add Fjørdhold to your Home
  Screen to enable notifications" with a short how-to).
- `subscription.ts`: `subscribe(vapidPublicKey)` (permission request →
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  → `PUT`), `unsubscribe()` (local `subscription.unsubscribe()` then `DELETE`),
  `currentEndpoint()`, `deviceLabelFromUserAgent()` ("Chrome on Android",
  "Safari on iPhone", "Firefox on Linux"), `urlBase64ToUint8Array`. Pure
  helpers separated from browser calls so vitest covers them.
- `stores/notifications.ts` (pinia): `config`, `subscriptions[]`,
  `thisDeviceId`, `permission`, `disabledTypes`, actions `load`, `enable`,
  `disableThisDevice`, `revoke(id)`, `rename(id)`, `setTypeEnabled`,
  `sendTest`, `reconcile()`.
- `reconcile()` runs once after `auth.ensureInitialized()` resolves a logged-in
  user (in `App.vue`/router `afterEach` once): reads
  `pushManager.getSubscription()`; if a local subscription exists and its
  endpoint is in the server list → re-`PUT`s the current subscription
  (idempotent, updates `LastSeenAt`, re-parents on account switch). If a local
  subscription exists but the server has no row for it and the user did not
  explicitly disable this device (a `localStorage` flag
  `bjarnoy.push.disabledHere`) → it was revoked from another device →
  `subscription.unsubscribe()` locally and show a one-time notice. If
  `Notification.permission === 'denied'` → show the "blocked in browser"
  state with instructions.

### Views and navigation

- New route `/settings/notifications` → `views/NotificationSettingsView.vue`,
  auth-guarded like `/profile` (`router/authGuard.ts`). A `/settings` parent
  is deliberately *not* introduced yet — one page, one route; when a second
  settings concern appears, nest then.
- Entry points: a "Notifications" link in the own-profile branch of
  `ProfileView.vue` (next to the locale switcher, which is the existing
  "account preference" spot) and a bell/gear item in `HudNav.vue`.
- Page layout (top to bottom):
  1. **This device** card: status (not enabled / enabled / blocked in
     browser / needs Home-Screen install / unsupported), primary button
     "Enable notifications on this device", secondary "Send test
     notification" once enabled, "Turn off on this device".
  2. **Notification types** (phase 2): grouped toggles rendered from
     `/types`; non-opt-out-able rows shown locked with an explanation.
  3. **Your devices** (phase 3): list from `/subscriptions`, "this device"
     badge, label inline-edit, `lastSeenAt`/`lastDeliveredAt`, "Remove".
- Anonymous (OwnerId-only) visitors see the page's content replaced by
  "Create an account to receive notifications" linking to `/register`.

### Permission prompt UX

- **Never on load, never unprompted.** The browser prompt fires only from
  the "Enable notifications" click on the settings page (a user gesture is
  also mandatory on Safari).
- One contextual nudge, phase 4: after a player queues an order whose
  `CompletesAt` is > 30 min away, `QueueDrawer.vue` shows a dismissable inline
  line "Get notified when this finishes → Settings" (a link, not a prompt).
  Dismissal persisted in `localStorage`, shown at most once per device.
- If permission is `denied`, the page never re-asks (browsers won't anyway);
  it explains how to unblock in site settings.

## Multi-device behaviour (the concrete cases)

| Situation | What happens |
|---|---|
| Same account subscribes on phone and laptop | Two `push_subscriptions` rows (different endpoints), both labelled from UA. Every outbox row fans out to both. |
| Revoke the laptop *from the phone* | `DELETE /subscriptions/{laptopId}` removes the row → no further sends. Laptop still holds a browser-side subscription; on its next app open `reconcile()` sees no server row and no local "disabled here" flag → `unsubscribe()` locally + notice "Notifications were turned off for this device from another device." |
| Turn off on the device itself | `subscription.unsubscribe()` first, then `DELETE`; set `bjarnoy.push.disabledHere`. If the `DELETE` fails offline, the reconcile pass retries (row is harmless meanwhile: the push service rejects with `410`, which deletes it server-side anyway). |
| Permission revoked in browser settings | The browser drops the subscription. Next send → push service returns `410 Gone` → `PushDeliveryService` deletes the row. Next app open: `permission === 'denied'` → "blocked" state. Device disappears from the list within one failed delivery. |
| Browser/OS rotates the subscription | `pushsubscriptionchange` sets the pending flag; `reconcile()` `PUT`s the new endpoint (new row) — the old row dies on its next `410`. |
| Logout on one device | `POST /auth/logout { refreshToken, pushEndpoint }` deletes that endpoint's row; the other device is untouched (rows are per-endpoint, never per-user in bulk). |
| Log in as a different account on the same browser | `PUT` re-parents the endpoint's row to the new user — one browser install, one subscription, owned by whoever is signed in. |
| Ban | All rows deleted in `SetStatusAsync`. |
| Device silent for months | `LastSeenAt` is available for a future retention sweep in `UserActivityRetentionHostedService`'s image; not scheduled now. |

## Migration plan

1. Add entities + `DbSet`s (`PushSubscriptions`, `NotificationOptOuts`,
   `NotificationOutbox`) and `OnModelCreating` blocks to `GameDbContext.cs`
   (table names `push_subscriptions`, `notification_opt_outs`,
   `notification_outbox`; enums `HasConversion<int>()`; indexes as above;
   `UserEntity.PushSubscriptions` nav with cascade, next to `RefreshTokens`).
2. `cd src/backend && dotnet ef migrations add AddPushNotifications --project src/Bjarnoy.Migrations.Sqlite --startup-project src/Bjarnoy.Migrations.Sqlite`
   and the same for `Bjarnoy.Migrations.PostgreSql`. Commit both migration
   pairs + both `GameDbContextModelSnapshot.cs` in one commit
   (`feat(db): add push subscription, opt-out and outbox tables`).
3. Nothing provider-specific (no JSON columns, no Postgres arrays) — the
   opt-out-rows decision above is partly *because* of the dual-provider rule
   in `docs/tech/backend.md` ("Nothing in the model may use a provider-only
   construct").
4. Phase 2 adds `AddArmyArrivesAt` (nullable `ArrivesAt` on `armies`, plus a
   backfill that the next settle-on-read fills — the scanner treats `null` as
   "not due", so pre-existing in-transit armies resolve on read exactly as
   today; no data migration needed).
5. `MigrationTests.cs` already asserts the model matches both snapshots; no
   new test needed for the migration itself.

## Implementation phases (each bullet = one conventional-commit PR)

### Phase 0 — PWA shell (frontend only, no backend)
- `feat(frontend): add web app manifest, icons and service worker registration`
  — manifest, icons, `sw.js` with `push`/`notificationclick` handlers,
  registration in `main.ts`. Verify: Lighthouse "installable", `sw.js`
  served at `/sw.js` under `vite preview` and under the Docker image's
  `wwwroot`. e2e: `landing.spec.ts` gains an assertion that
  `navigator.serviceWorker.getRegistration()` resolves.

### Phase 1 — end-to-end proof with one type (`DirectMessage`) + test push
- `feat(db): add push subscription, opt-out and outbox tables` — entities,
  context, both migrations.
- `feat(api): push subscription endpoints and VAPID configuration` —
  `PushOptions`, `/config`, `/subscriptions` GET/PUT/DELETE, logout
  `pushEndpoint`, `Lib.Net.Http.WebPush` + `IPushSender`/`WebPushSender`,
  dev VAPID pair in `appsettings.Development.json`, AppHost parameter.
  Integration tests: subscribe/list/delete, ownership isolation (`404` for
  foreign id), anonymous `401`, locked user `403` via
  `ActiveUserEndpointFilter`, upsert on same endpoint, re-parenting on
  account switch, `/config` disabled when unconfigured.
- `feat(api): notification outbox, delivery hosted service and message
  notifications` — `NotificationEnqueuer`, `NotificationTextRenderer` (en/de),
  `PushDeliveryService`, `PushDeliveryHostedService`, hook in
  `ChatService.SendAsync`, `POST /subscriptions/{id}/test`. Tests: fake
  `IPushSender` recording sends; `410` deletes the subscription; 5 failures
  mark the row; expired rows skipped; locked user skipped; dedupe key
  collision is a no-op; `ChatEndpointsTests` asserts a send produces exactly
  one outbox row per recipient with the right `url`.
- `feat(frontend): notification settings page with enable and test push` —
  `push/` module, store, `NotificationSettingsView.vue`, route, profile/HUD
  links, "this device" card, i18n keys en/de. Vitest for
  `subscription.ts` helpers and the view's state matrix; e2e
  `notification-settings.spec.ts` with stubbed `PushManager` (below).
- Manual verification gate before phase 2: Chrome desktop, Firefox desktop,
  Android Chrome, iOS Safari (Home Screen) each receive a test push and a
  real DM; screenshots in the PR.

### Phase 2 — full taxonomy, scanner, per-type settings
- `feat(domain): notification type catalogue` — `NotificationType`,
  `NotificationCatalogue` (groups, TTLs, tags, `optOutAllowed`), `GET /types`.
  Domain.Tests: every enum value has a catalogue entry; values are unique and
  never reused (a frozen-list test like the `LeaderboardCatalogue` tests).
- `feat(api): notification preferences endpoints` — opt-out GET/PUT,
  validation of non-opt-out-able types, dispatcher and enqueuer honour
  opt-outs. Integration tests for both directions.
- `feat(db): cache army arrival instant` — `AddArmyArrivesAt` migrations.
- `feat(api): due-completion scanner for builds, training, armies and
  trade` — `DueCompletionScanner` + hosted service; enqueue hooks in
  `SettlementService` settle path, battle/field/trade report creation.
  Integration tests with `TestTimeProvider`: queue an order, advance past
  `CompletesAt`, call `SettleDueAsync` directly → exactly one
  `BuildCompleted` row; call it twice → still one (dedupe); a read *before*
  the scan → still exactly one; queued second order gets its own row only
  after its own completion; dispatch an army, advance past arrival, scan →
  battle report rows for both sides.
- `feat(api): guild, endboss and account-status notifications` — remaining
  synchronous hooks; tests per hook.
- `feat(frontend): per-type notification toggles` — grouped toggles rendered
  from `/types`, optimistic update with rollback on failure, locked rows.
  Vitest + e2e toggle persistence against the mocked API.
- `docs(backend): document push delivery as the second active poll` —
  `docs/tech/backend.md` "Everything is lazy" addendum + VAPID setup notes.

### Phase 3 — device management
- `feat(api): rename and touch push subscriptions` — `PATCH
  /subscriptions/{id}`, `LastSeenAt` on upsert, `LastDeliveredAt` on send.
- `feat(frontend): manage push devices` — "Your devices" list, this-device
  badge, inline rename, remove with confirm, `reconcile()` on app open with
  the "turned off from another device" notice, logout passes `pushEndpoint`.
  Vitest for the store's reconcile decision table; e2e for list/rename/remove
  against mocked API.

### Phase 4 — later, only if wanted
- Contextual nudge in `QueueDrawer.vue`; `StorageFull` /
  `SettlementSlotUnlocked` scheduled types; `IncomingAttack` (needs a
  visibility design first); dead-device retention sweep; SSE/SignalR for
  in-tab live updates replacing `REPORT_POLL_MS`; Capacitor evaluation
  (Risks, below).

## Testing approach

**Testable without any real push service (the bulk):**

- `Bjarnoy.Domain.Tests`: catalogue completeness/uniqueness; TTL/tag rules.
- `Bjarnoy.Infrastructure.Tests` (Sqlite in-memory like `PlotReservations`
  tests): `PushDeliveryService` against a fake `IPushSender` — fan-out to N
  devices, `Gone` → row deleted, throttling → retry counter, opt-out and
  `Status` gates, expiry, dedupe; `NotificationTextRenderer` en/de and
  fallback; `DueCompletionScanner` with `TestTimeProvider`.
- `Bjarnoy.Api.IntegrationTests` (`SqliteApiFixture`, `BjarnoyApiFactory`
  replacing `IPushSender` with the recording fake the same way it
  `RemoveAll<TimeProvider>()`): every endpoint, auth/ownership matrix, the
  chat → outbox → send chain in one test, scanner scenarios by advancing the
  clock and calling `SettleDueAsync`/`DeliverDueAsync` directly (never
  waiting on the timers — the hosted services are not unit-tested beyond
  "registered when configured, absent when not", mirroring how the existing
  three are treated). VAPID: the test config carries a throwaway pair;
  `WebPushSender` itself gets one test that it produces a request with
  `Authorization: vapid ...` and `Content-Encoding: aes128gcm` against a
  local `HttpMessageHandler` stub — that's the only place the library is
  exercised, and it's asserting *our* wiring, not the library.
- `Bjarnoy.AppHost.Tests`: the VAPID parameter is wired (Docker-dependent,
  CI only).
- Frontend vitest: `push/subscription.ts` pure helpers (`urlBase64ToUint8Array`,
  `deviceLabelFromUserAgent` table), store `reconcile()` decision matrix with
  a mocked `navigator.serviceWorker`, `NotificationSettingsView` state
  rendering (supported / needs-install / denied / anonymous).
- Playwright e2e (`e2e/notification-settings.spec.ts`,
  `e2e/notification-devices.spec.ts`): `context.grantPermissions(['notifications'])`
  makes `Notification.permission === 'granted'`; `page.addInitScript` stubs
  `PushManager.prototype.subscribe`/`getSubscription` to return a fixed fake
  `PushSubscription` (`endpoint: https://push.example/abc`, keys) — Chromium
  has no reachable push service in CI and none is needed to test the click →
  `PUT` → list → revoke UI flow against the mocked API in `fixtures.ts`.
  Selectors via `data-testid`, no timeout inflation (repo rule).

**Needs manual verification (document a checklist in the PR):**

- Actual delivery on Chrome/Edge (FCM), Firefox (autopush), Safari macOS,
  iOS Safari after Home-Screen install; notification click deep-links and
  focuses an existing tab; tag collapsing; behaviour after permission revoke.
- Production egress: the API container must reach
  `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `web.push.apple.com` (and `*.notify.windows.com` for Edge/Windows). Note:
  the Claude Code cloud sandbox's proxy will block these, so *no* real send
  can be reproduced from a session — the fake `IPushSender` path is the
  in-sandbox ceiling; say so rather than claiming delivery was verified.

## Edge cases

- **Queue-chained orders**: order 2's `CompletesAt` is null until order 1 is
  settled. The scanner settles the settlement (not the order), so `SettleTo`
  advances the queue and stamps order 2 in the same pass; order 2 is found
  by a later tick. Correct by construction, no special-casing.
- **Read races the scanner**: a player watching the settlement triggers the
  settle path first; the enqueue lives in that path with the dedupe key, so
  the scanner's later attempt is a no-op. The player then gets a push while
  looking at the tab — acceptable (Chrome suppresses notifications for
  focused same-origin clients only if the SW checks `clients.matchAll()`;
  do that check in `sw.js`: if a visible focused client exists on the same
  origin, skip `showNotification`).
- **Many builds finishing together**: tag `build:{settlementId}` collapses on
  the device; the outbox still holds one row each (audit trail).
- **Multiple settlements per user**: text always names the settlement
  (`"{settlementName}: Longhouse level 4 finished"`), deep link goes to
  `/settlement` (the frontend's persisted current-settlement id is not
  overridden — a `?settlementId=` query param is a phase-4 nicety).
- **Locale change after enqueue**: text is rendered at enqueue time; a
  locale switch mid-flight yields one notification in the old language.
  Accepted.
- **Payload size**: push services cap at 4 KB; `PayloadJson` max 2000 chars
  keeps well under with the `aes128gcm` overhead.
- **Duplicate `PUT` from two tabs at once**: unique index on `Endpoint`
  makes the second an update; handle the unique-violation race by retrying
  the read once.
- **Feature disabled in an environment** (`Push` unconfigured): `/config`
  returns `enabled:false`, hosted services are not registered, enqueuer
  short-circuits (no outbox writes) so the table doesn't grow for nothing.
- **SQLite `DateTimeOffset` ordering**: both providers already order on
  `DateTimeOffset` columns (`OccurredAt`, `ArrivesAt`); the outbox query
  follows the same pattern, no provider divergence.

## Open questions / risks

1. **iOS**: Web Push requires iOS 16.4+ *and* Home-Screen installation; there
   is no prompt inside plain Safari. Removing the icon silently kills the
   subscription (surfaces as `410`). If analytics later show most mobile
   players are on iOS and never install, a Capacitor/TWA wrapper becomes the
   pragmatic fix — but only then; it is a distribution decision with store
   overhead, not an engineering one to pre-empt.
2. **VAPID private key custody**: one production pair, never rotated
   (rotation = every device must re-subscribe). Stored as a Coolify secret;
   the dev pair in `appsettings.Development.json` mirrors the JWT
   dev-key precedent. Confirm the ops owner is comfortable with the JWT-style
   committed dev key vs. generating one at first run.
3. **Per-device vs per-user type preferences**: the plan chooses per-user. If
   "quiet on phone, everything on desktop" is wanted, add a nullable
   `SubscriptionId` to `notification_opt_outs` later — the row design extends
   without a rewrite.
4. **Guild event surface**: which membership transitions `GuildService`
   actually emits (invite/accept/kick) needs a read at implementation time;
   the enum reserves `GuildMembership` regardless.
5. **`IncomingAttack`**: only meaningful if defenders are allowed to see
   incoming armies; that visibility rule doesn't obviously exist. Needs its
   own small design note before it is a type.
6. **Privacy/consent**: a push endpoint is a per-device identifier held by
   Google/Mozilla/Apple; the repo already cares about this class of concern
   (self-hosted fonts to avoid sending IPs to Google). `ImpressumView.vue`'s
   privacy text needs a sentence, and enabling must stay strictly opt-in
   (it is, by construction).
7. **Scanner load**: two indexed "due" queries every 30 s is negligible at
   current scale, but the army scan settles armies that nobody is looking at
   — it changes *when* battles resolve (at arrival instead of at next read).
   That is arguably more correct (`docs/tech/backend.md` already accepts the
   endboss trigger for the same reason), but it's a gameplay-visible change
   worth a sentence in the docs PR and a heads-up to the user.
8. **Windows/Edge push endpoints and corporate proxies** occasionally
   return `429`/`5xx` for long stretches; the 5-attempt cap plus per-type
   TTL bounds the damage. No dead-letter UI is planned; `LastError` in the
   row is the debugging surface.
9. **Docs claim "the one active poll"**: after this feature that sentence is
   false in two places (`Program.cs` comment, `backend.md`); the docs PR in
   phase 2 fixes both — don't let it drift.

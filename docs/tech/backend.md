# Backend

ASP.Net Core on .NET 10, orchestrated with [Aspire](https://aka.ms/aspire), in
`src/backend`. What it replaces and why is in
[backend-rewrite-decisions.md](./backend-rewrite-decisions.md).

## Layout

```
src/backend/
  Bjarnoy.slnx
  global.json                     SDK pin + `dotnet test` runner opt-in
  Directory.Build.props           shared compiler settings (warnings as errors)
  Directory.Packages.props        every package version, centrally
  src/
    Bjarnoy.Domain                game rules. No package references at all.
      World/                      hex maths, terrain, world generation
      Economy/                    resource pool, game clock (pause/grace)
      Buildings/                  catalogue, build queue, settlement rules
    Bjarnoy.Infrastructure        EF Core model, migrator, world service
    Bjarnoy.Migrations.PostgreSql generated migrations, PostgreSQL dialect
    Bjarnoy.Migrations.Sqlite     generated migrations, SQLite dialect
    Bjarnoy.ServiceDefaults       telemetry, health checks, resilience
    Bjarnoy.Api                   minimal API + migrator CLI + SPA host
    Bjarnoy.AppHost               Aspire orchestration for local dev
  tests/
    Bjarnoy.Domain.Tests          hex maths, noise, generation
    Bjarnoy.Api.IntegrationTests  the real app over a real database
    Bjarnoy.AppHost.Tests         the real Aspire orchestration, driven by a real browser
```

`Bjarnoy.Domain` deliberately has no package references. World generation, hex
maths and (in time) the game rules must be testable without a host, a database
or a clock, so anything ambient is passed in.

## Running it

Everything at once — PostgreSQL, the API, the Vite dev server, and a dashboard
over the three:

```bash
cd src/backend
dotnet run --project src/Bjarnoy.AppHost
```

Just the API, against a local SQLite file, migrating itself on startup:

```bash
cd src/backend
dotnet run --project src/Bjarnoy.Api
```

Tests:

```bash
cd src/backend
dotnet test --project tests/Bjarnoy.Domain.Tests
dotnet test --project tests/Bjarnoy.Api.IntegrationTests
dotnet test --project tests/Bjarnoy.AppHost.Tests
```

The PostgreSQL half of the integration suite needs Docker. Without it those
tests skip with a stated reason rather than failing.

`Bjarnoy.AppHost.Tests` starts the exact orchestration `dotnet run --project
src/Bjarnoy.AppHost` does (Postgres, migrator, API, frontend dev server) via
`Aspire.Hosting.Testing`, and drives the real frontend with Playwright — it's
the regression test for the frontend silently falling back to demo mode
instead of the backend Aspire just started for it (see
`src/frontend/vite.config.ts` and `Bjarnoy.AppHost/AppHost.cs`). It needs
Docker (for Postgres), Node (for the frontend), and Playwright's browser
installed once: `pwsh bin/Debug/net10.0/playwright.ps1 install --with-deps
chromium` from the test project's directory after a build.

## Database

One EF Core model, two providers:

| Provider | For |
|---|---|
| `Sqlite` (default) | a single-container deployment, and local dev |
| `PostgreSql` | hosted, multi-world play |

Selected with `Database:Provider`; the connection string comes from
`Database:ConnectionString` or the `gamedb` connection string (which Aspire
supplies in an orchestrated run).

Because EF Core migrations are provider-specific SQL, each provider has its own
migrations assembly. Adding a migration means adding it twice:

```bash
cd src/backend
dotnet ef migrations add <Name> --project src/Bjarnoy.Migrations.Sqlite      --startup-project src/Bjarnoy.Migrations.Sqlite
dotnet ef migrations add <Name> --project src/Bjarnoy.Migrations.PostgreSql  --startup-project src/Bjarnoy.Migrations.PostgreSql
```

CI fails the build if the model has moved on from either set, so forgetting the
second one is caught rather than discovered in production.

Nothing in the model may use a provider-only construct, or the other provider's
migrations stop building. The integration suite runs the same tests against both
for that reason — it is how the "SQLite cannot ORDER BY a `DateTimeOffset`" bug
was found.

## The migrator

The API executable is also the migrator. A deployment brings the schema forward
with the exact image it is about to roll out, and only then replaces the running
containers:

```bash
docker run --rm <image> --migrate          # apply; exits 0 when done
docker run --rm <image> --migrate-status   # report; exit 2 = migrations pending
docker run --rm <image> --migrate-script   # print the SQL, apply nothing
```

`--migrate-status` exits `2` rather than `1` when there is work to do, so a
deploy script can branch on the code instead of parsing the output:

```bash
docker run --rm "$image" --migrate-status; case $? in
  0) echo "schema is current" ;;
  2) docker run --rm "$image" --migrate ;;
  *) echo "cannot reach the database" >&2; exit 1 ;;
esac
```

Applying is idempotent and safe to retry: EF takes a database lock for the
duration, so a second runner waits rather than double-applying.

`Database:MigrateOnStartup` migrates in-process instead. It is off by default —
a failed migration should fail the deploy, not half the replicas — and exists
for local SQLite runs.

## World generation

A world is stored as **its seed and generation parameters, not its tiles**.
Terrain is a pure function of the two, so there is no tile table: only hexes
that acquire state (an owner, a building) will ever become rows.

`TerrainSampler` is a bit-exact port of the frontend's
`src/frontend/src/lib/map/worldGenerator.ts`, down to JavaScript's
integer-coercion semantics. That is what lets the client render terrain it was
never sent. The parity tests hold the two together with checksums taken from
running the TypeScript under Node over 102,487 hexes across seven seeds; if
either side is changed deliberately, regenerate them **from the TypeScript**.

The server owns what the client cannot derive, and those are the parts that get
persisted:

- **islands** — connected landmasses, found by flood-filling the whole map
- **names** — stable per world, so the world map has something to label
- **start positions** — plots a first settlement may be founded on: a grass hex
  with a forest and two more grass hexes adjacent, and no water within two hexes

Generation is pure and takes its seed as a parameter, so two worlds can be
generated at once. The legacy generator could not: it set a static
`Noise.Seed`, which two concurrent calls would corrupt.

## Everything is lazy

Nothing in this backend ticks. There is no background worker advancing
resources, no job completing builds, no scheduler the world depends on. Every
piece of time-dependent state is stored as a value plus the instant that value
was last true, and the current answer is computed when someone asks.

A settlement's resources are a stock, an hourly rate and a timestamp
(`ResourcePool`). Its current wood is `stock + rate x hours-since-settled`,
clamped to storage capacity. A build order is a completion instant; it is done
when that instant has passed. Terrain is a pure function of the world seed
(`TerrainSampler`), so it is not stored at all.

This is the one design idea worth keeping wholesale from `legacy/browsergame` —
its `EntityResources` did exactly this — and it buys three things:

- **Downtime is harmless.** A process that was dead for six hours comes back to
  a world exactly as far along as the clock says. There are no missed ticks to
  reconcile because there were never any ticks.
- **An idle world costs nothing.** Ten thousand settlements nobody is looking at
  do no work. Cost scales with reads, not with world size.
- **Offline players are not special-cased.** Someone returning after two days is
  one subtraction away from the right answer.

### The stock is only written when it changes

Reading is not settling. `ResourcePool.At(now)` is pure — it returns an amount
and leaves the pool untouched — so a request that merely displays a settlement
produces no new pool and therefore nothing for the database to save. The type
is immutable, which makes this structural rather than a convention: only
`TrySpend`, `Deposit` and `WithRate` return a changed pool, and each of those is
a real state change that has to be persisted anyway.

`Settlement.SettleTo(now)` follows the same rule for the queue. It returns
`Changed = false` when no order was due, and the caller skips the write.

The consequence to keep in mind when adding to this: **do not settle on a read
path**. If a new endpoint calls `SettledTo` just to get a number, it has turned
every page view into a database write.

### Ordering matters when the rate changes

`WithRate` settles *before* applying the new rate, so the hours already elapsed
accrue at the old one. Skipping that would let a finished lumberjack
retroactively produce for the hours before it existed. Likewise `TrySpend`
settles before deducting — the legacy version read its clock twice while doing
this and silently dropped whatever accrued in between.

## Pausing a lazy world

Because nothing ticks, a pause cannot be implemented by stopping a worker —
there is no worker to stop. Worse, to a stored timestamp, six hours of
deliberate pause and six hours of unplanned outage are indistinguishable.

So a pause is a change of **clock**, not of rules. Every timestamp the domain
stores is a *game* instant, and `GameClock` is the only thing that knows about
wall time:

```
gameTime(wall) = wall - accumulatedOffset      // running
gameTime(wall) = frozenAt - accumulatedOffset  // frozen (constant)
```

Freezing makes every lazy computation downstream measure zero elapsed hours,
without any of them knowing pauses exist. Nothing in `ResourcePool` or the build
queue has a special case for it. Game time stays monotonic and continuous across
a freeze, so a build with eight minutes left when the world stops has exactly
eight minutes left when it comes back, however long the stop lasted.

Two things can be suspended independently — the passage of time, and the
acceptance of new commands — which gives four states:

| State | Time advances | New commands | For |
|---|---|---|---|
| `Running` | yes | yes | normal play |
| `Paused` | no | no | holding a round between sessions |
| `Locked` | yes | no | winding a round down; migrating underneath a live world |
| `Maintenance` | no | no | operational work, surfaced to players as maintenance |

`Locked` is the interesting one: queued work still completes and resources still
accrue, but nothing new can be started. `Maintenance` is mechanically the same
freeze as `Paused`, kept distinct so it can be shown differently and because
resuming from it normally credits grace.

### Grace

`Resume(now, grace)` credits extra time on top of the freeze, pushing every
deadline further out — for maintenance that ran long.

`AddGrace(span)` does the same without a state change, which is the fix for the
*opposite* problem: an outage nobody paused for, where the world kept accruing
while players could not act. Handing the time back undoes the progress they
never got to use.

Grace can only ever give time back; a negative value is rejected rather than
silently stealing progress.

Note what grace does and does not do. It moves game time backwards, which
delays everything still to come — a queued build takes that much longer in wall
terms, and production resumes only once the credited time is served. It does
**not** claw back what a settlement already banked: `ResourcePool.At` floors at
the last settled stock when asked for an earlier instant, so a player never
watches resources disappear. Grace is a delay, not a confiscation.

## API

`/api/v1/…`, with an OpenAPI document and a Scalar UI at `/scalar` in
development.

| Route | Description |
|---|---|
| `GET /api/v1/worlds` | list worlds |
| `POST /api/v1/worlds` | generate and store a world |
| `GET /api/v1/worlds/{id}` | one world |
| `GET /api/v1/worlds/{id}/islands` | its islands and their start positions |
| `GET /api/v1/worlds/{id}/tiles?qMin=&qMax=&rMin=&rMax=` | terrain for a window |
| `POST /api/v1/worlds/{id}/settlements` | found a settlement on a start position |
| `GET /api/v1/worlds/{id}/settlements` | settlements in a world |
| `POST /api/v1/worlds/{id}/state` | pause, lock, maintain or resume a world |
| `GET /api/v1/settlements/{id}` | a settlement as of now, completing what its queue owed |
| `POST /api/v1/settlements/{id}/builds` | queue a building |
| `GET /api/v1/buildings` | the catalogue: costs, durations, allowed terrain |
| `GET /health`, `GET /alive` | readiness and liveness |

Versions are literal path segments rather than a `{version:apiVersion}` route
parameter. Both work, but only the literal form yields concrete paths in the
OpenAPI document, which is what the frontend generates its typed client from:

```bash
npx openapi-typescript http://localhost:5180/openapi/v1.json \
  -o src/frontend/src/api/schema.ts --enum
```

`GET /api/v1/buildings` also has a frontend-only fallback: the tech-tree page
(`/tech-tree`) needs to render without a backend in demo mode, so
`src/frontend/src/data/building-catalogue.json` is a committed snapshot of
that endpoint's response, regenerated the same way against a running backend:

```bash
node scripts/export-catalogue-data.mjs
```

Run it whenever `BuildingCatalogue.cs` changes. Same manual/at-build-time
policy as the codegen above — nothing regenerates it automatically.

The health endpoints are only mapped outside development when
`ExposeHealthChecks` is set; the container image sets it, since an orchestrator
needs to probe them.

## User activity tracking

Two things are tracked per user: a **last-active timestamp**
(`UserActivityEntity`, one row per user, overwritten in place) and **session
windows** (`UserActivitySessionEntity`, a `StartedAtUtc`/`LastSeenAtUtc` pair
per burst of activity — a ping within `GapThreshold` of the previous one
extends the current session in place; a later one opens a new row).

Three things feed it, from most to least authoritative:

- `UserActivityEndpointFilter`, applied to every authenticated route. It is
  transparent to an anonymous request and, like `ActiveUserEndpointFilter`,
  never fails the request it rides along on — a tracking failure is logged
  and swallowed, not rethrown.
- A hook in `AuthService`'s refresh-token exchange, since that resolves a
  user id from a DB-backed token rather than a validated JWT and so is not
  covered by the endpoint filter.
- The frontend's `useActivityHeartbeat` composable (mounted from `App.vue`),
  which pings `POST /api/v1/activity/heartbeat` every ~5 minutes while the
  tab is visible and the user is authenticated. This is optional and
  best-effort: it only closes the gap where a logged-in user has a tab open
  and focused but isn't triggering any other API call — the other two
  signals cover everything else.

All three write through the same `IUserActivityTracker` (`UserActivityService`),
so there is one code path, one throttle, one session-boundary rule.

### Configuration

`UserActivityOptions`, bound from the `UserActivity` config section (same
convention as `JwtOptions`):

| Option | Default | Meaning |
|---|---|---|
| `GapThreshold` | 30 minutes | How long a gap between pings still counts as the same session. |
| `ThrottleInterval` | 60 seconds | At most one database write per user per interval — every `TrackAsync` call inside the window is a no-op. |
| `RetentionDays` | 180 days | How long a session row survives before `UserActivityRetentionService` may prune it. |

Override any of them the usual way, e.g. in `appsettings.json` or via
environment variables:

```json
{ "UserActivity": { "GapThreshold": "00:15:00", "RetentionDays": 90 } }
```

`UserActivityRetentionHostedService` sweeps hourly and deletes sessions past
`RetentionDays`; it never touches `UserActivityEntity`, which has no age to
prune — it is just overwritten by the next ping. Per this repo's CLAUDE.md,
the throttle and the retention sweep are real production behavior, not a
branch on whether this is a test run: a test that wants to see a second write
advances the injected `TimeProvider` past the interval instead.

### Admin UI and endpoints

The admin UI lives at `/admin/activity` (`AdminActivityView.vue`, alongside
the other `/admin/*` tabs — see `AdminLayout.vue`), showing an aggregate
active-users chart (`ActivityChart.vue`, Chart.js), a paged users table sorted
by last-active, and a per-user drill-down into session windows. All three
endpoints live under `/api/v1/admin/activity` and require the `Admin`
authorization policy:

| Route | Returns |
|---|---|
| `GET /admin/activity/summary?from=&to=&bucket=day\|hour` | Distinct active-user counts per time bucket (max 92 days for `day`, 7 for `hour`). |
| `GET /admin/activity/users?page=&pageSize=&sort=` | Every non-system user, paged and sorted newest-active-first, including users who have never been tracked (`lastActiveAtUtc: null`). |
| `GET /admin/activity/users/{userId}?from=&to=` | One user's session windows in the range, plus session count and total active duration. |

### The `DateTimeOffset` translation limitation

EF Core's SQLite provider cannot translate a relational comparison (`<`,
`>=`, `ORDER BY`, ...) on a `DateTimeOffset` column — only equality does. This
shows up in three places in this area:

- `UserActivityService` orders sessions by `Id` (a UUIDv7, sorting
  chronologically anyway) instead of `LastSeenAtUtc` to find the session to
  extend.
- `UserActivityQueryService` (bucketed summary, users-by-last-active sort,
  per-user session windows) and `UserActivityRetentionService` (the
  retention cutoff) both pull the rows a translatable predicate — an
  equality filter, or none at all — can select, then do the actual
  date/time comparison, sort, or delete-id selection **in memory** once the
  rows are materialized. The eventual write (if any) is a set-based
  operation keyed on the resulting id list, so it's still one query, not a
  per-row loop.

The same "load, then compare/order in memory" idiom already existed before
this feature (`WorldService.TriggerDueEndbossesAsync`); it is now used in
three places here too. It's one code path, identical on SQLite and
PostgreSQL — worth knowing about up front before adding a fourth service that
naively puts a `DateTimeOffset` comparison in a LINQ `Where`/`OrderBy` that
EF is expected to translate to SQL, since that fails silently in some
provider/query shapes and loudly (`InvalidOperationException`) in others.

## The image

`deploy/Dockerfile` builds the Vue app, copies it into the API's `wwwroot`
**before** `dotnet publish`, and publishes the result. One container serves both
the app and the API it talks to, so a browser hits a single origin and there is
no CORS to configure.

The ordering is load-bearing: `MapStaticAssets` serves from a manifest generated
during publish, so a frontend copied in afterwards is invisible to it — every
hashed asset 404s — and loses its precompressed `.br`/`.gz` variants.

```bash
git submodule update --init            # the tile art the frontend imports
docker build -f deploy/Dockerfile -t bjarnoy .
docker run --rm -v bjarnoy-data:/data bjarnoy --migrate
docker run --rm -p 8080:8080 -v bjarnoy-data:/data bjarnoy
```

The image defaults to SQLite at `/data/bjarnoy.db`. Point it at PostgreSQL with

```bash
-e Database__Provider=PostgreSql \
-e Database__ConnectionString='Host=…;Database=…;Username=…;Password=…'
```

Known rough edge: assets are served with `cache-control: no-cache`, so a browser
revalidates and gets a 304 rather than skipping the request entirely.
`MapStaticAssets` only marks a file immutable when it recognises the fingerprint
in its name, and it does not recognise Vite's `name-HASH.ext` form. Teaching it
that pattern would earn real immutable caching.

## Not in here yet

Auth — the legacy JWT + rotating refresh token design is worth porting as
designed. Until it lands, a settlement has no real owner.

Combat, fleets and caravans. Razing and capturing a settlement — the border
rules assume a settlement's buildings only ever appear, never disappear.

The building catalogue's numbers are a starting point for balancing, not a
finished economy.

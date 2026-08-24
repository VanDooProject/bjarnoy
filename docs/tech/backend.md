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
    Bjarnoy.Infrastructure        EF Core model, migrator, world service
    Bjarnoy.Migrations.PostgreSql generated migrations, PostgreSQL dialect
    Bjarnoy.Migrations.Sqlite     generated migrations, SQLite dialect
    Bjarnoy.ServiceDefaults       telemetry, health checks, resilience
    Bjarnoy.Api                   minimal API + migrator CLI + SPA host
    Bjarnoy.AppHost               Aspire orchestration for local dev
  tests/
    Bjarnoy.Domain.Tests          hex maths, noise, generation
    Bjarnoy.Api.IntegrationTests  the real app over a real database
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
```

The PostgreSQL half of the integration suite needs Docker. Without it those
tests skip with a stated reason rather than failing.

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
| `GET /health`, `GET /alive` | readiness and liveness |

Versions are literal path segments rather than a `{version:apiVersion}` route
parameter. Both work, but only the literal form yields concrete paths in the
OpenAPI document, which is what the frontend generates its typed client from:

```bash
npx openapi-typescript http://localhost:5180/openapi/v1.json \
  -o src/frontend/src/api/schema.ts --enum
```

The health endpoints are only mapped outside development when
`ExposeHealthChecks` is set; the container image sets it, since an orchestrator
needs to probe them.

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

Auth (the legacy JWT + rotating refresh token design is worth porting as
designed), settlements, resources and the build queue. The resource model to
carry forward is the legacy one: store a stock, a rate and a timestamp, and
compute the current value on read, so the world keeps running while a player is
offline and nothing has to tick.

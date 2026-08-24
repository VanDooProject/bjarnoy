# Backend rewrite — what we take from the legacy projects, what we rebuild

Written before starting `src/backend`. The two legacy code bases are described
in detail in [`docs/legacy/browsergame.md`](../legacy/browsergame.md) (2018–2019,
ASP.Net Core 2.2 + MongoDB) and [`docs/legacy/backend.md`](../legacy/backend.md)
(2025, ASP.Net Core 9 + Postgres/Dapper). This document is the *decision* layer
on top of those: for each area, port or rebuild, and why.

---

## Summary

| Area | Verdict | Source |
|---|---|---|
| Hex coordinate math | **Port (rewritten)** | `browsergame` `HexCoordinates3D` / `CubeCoordinates3D` |
| Noise → terrain island generation | **Port the algorithm, not the code** | `browsergame` `IslandFactoryOrganic` |
| Largest-landmass flood fill, coastal rim, edge falloff | **Port (rewritten)** | `browsergame` `IslandFactoryOrganic` |
| Start-position rules | **Port (rewritten)** | `browsergame` `StartPositionHelper` |
| Resource/production accrual model | **Port the idea** | `browsergame` `EntityResources` |
| Layered project split (Core / Infrastructure / API) | **Keep the shape** | `backend` |
| `EntityId` (UUIDv7 value object) | **Rebuild, simplified** | `backend` |
| Auth: JWT access + rotating refresh, BCrypt, email verification | **Port the design** | `backend` |
| API versioning + OpenAPI + Scalar | **Keep** | `backend` |
| Migrator that runs before the app | **Keep the idea, new implementation** | `backend` `DatabaseMigrator` |
| Integration test suite shape | **Keep the shape, new implementation** | `backend` |
| Dapper + hand-written Postgres SQL | **Drop** | `backend` |
| Atlas migrations (`sql/atlas.hcl`) | **Drop** | `backend` |
| MongoDB, `MongoEntity`, `MongoDBRef` | **Drop** | `browsergame` |
| Tile-per-C#-subclass hierarchy | **Drop** | `browsergame` |
| log4net, Newtonsoft.Json, SignalR-as-designed | **Drop** | `browsergame` |
| GitLab CI | **Drop** (GitHub Actions instead) | `backend` |

---

## What we take

### 1. The hex coordinate system (`legacy/browsergame`)

`HexCoordinates3D` (axial `q`/`r`) with an explicit conversion to
`CubeCoordinates3D` for distance is exactly the redblobgames model the current
frontend already uses in `src/frontend/src/lib/hex/coords.ts`. The maths is
right and it is the one thing both legacy projects and the new frontend agree
on, so the backend has to speak it too.

We rewrite rather than copy because the legacy types are mutable classes with
public fields (`public int x;`), used as dictionary keys by distance comparison
(`CheckIfSameTile` compares against a configurable "allowed distance
disturbance" — a workaround for having stored coordinates as floats). The new
version is a `readonly record struct HexCoord(int Q, int R)` with real value
equality, so it can be a dictionary key without ceremony.

One bug worth not porting: `Island.getNeighbors` iterates the 3×3 square
around a hex, which on an axial lattice yields 8 candidates — the 6 true
neighbours plus 2 hexes at distance 2. Every consumer of it (coastline
detection, the start-position scan) is therefore subtly wrong. The new
implementation uses the 6 axial direction vectors.

### 2. The island generation algorithm (`legacy/browsergame`)

`IslandFactoryOrganic` is the most valuable thing in either legacy repo. The
pipeline is sound and we keep it step for step:

1. sample two noise fields per hex — elevation and humidity;
2. multiply elevation by a radial/edge falloff so the landmass detaches from
   the map border and becomes an island rather than a plateau;
3. threshold elevation into water / beach / lowland, and split lowland by
   humidity into grass vs forest, with the high band becoming ridge;
4. flood fill to find connected landmasses and keep the biggest one;
5. add a shallow-water rim around the coast.

What we change:

- **Determinism.** The legacy code sets a *static* `Noise.Seed` on the
  `SimplexNoise` package and separately seeds a `Random` for tile orientation.
  Static global seed state means two worlds generated concurrently corrupt each
  other's output. The new generator takes a seed per world and holds all its
  state locally, so generation is reproducible and parallel-safe — a
  requirement, since the world seed is what we persist rather than every tile.
- **No external noise dependency.** We implement value noise (hash + smoothstep
  + bilinear interpolation) in the domain project. It is ~30 lines, has no
  package to keep in sync, and — importantly — lets the backend reproduce the
  *same* algorithm the frontend already ships in
  `src/frontend/src/lib/map/worldGenerator.ts`.
- **Recursion → explicit stack.** `scanFromTile` is recursive per tile; on a
  large island that is a stack overflow. The rewrite uses an explicit queue.
- **No PNG side effects.** `GetRndIsland` writes `map_01.png` … `map_06.png` to
  disk on every call via ImageMagick. Debug rendering does not belong in a
  request path; it is dropped (the frontend renders the map).
- **Archipelago, not one island.** `MECHANICS.md` puts multiple settlements on
  an island and multiple islands in a sea. Legacy generated a single island and
  `MapCreatorHelper` shuffled islands around until they stopped overlapping.
  Instead we seed islands on a coarse grid with per-cell jitter, which is what
  the frontend generator already does — no collision loop needed, and island
  placement stays O(1) per hex.

### 3. Terrain and resource vocabulary

The frontend's `Terrain` union (`sea | sand | grass | forest | mountain`) is
already in use by the renderer and the tile art pack, so the backend's terrain
enum serialises to exactly those names. The backend becomes the authority; the
frontend keeps its local generator only as an offline/preview fallback.

`MECHANICS.md` names four resources (wood, stone, grain, silver) while the
frontend currently has `wood/stone/food/iron`. Reconciling those is out of scope
for this PR — the backend models terrain now and resources when production
lands.

### 4. Resource accrual by timestamp (`legacy/browsergame`)

`EntityResources` stores `ResourceStoredAtLastCalculation` +
`LastResourceStorageRefresh` + `HourlyResourceProduction` and computes the
current stock lazily on read. That is the correct model for a real-time game
that must keep running while nobody is logged in, and it is what we will use —
no per-tick write amplification. Not implemented in this PR, but the schema is
shaped for it.

### 5. The layered split and auth design (`legacy/backend`)

`BG.Core` / `BG.Infrastructure` / `BG.API` with repository interfaces in the
core is a reasonable skeleton and we keep the shape (renamed
`Bjarnoy.Domain` / `Bjarnoy.Infrastructure` / `Bjarnoy.Api`). The auth design —
short-lived JWT access token, rotating refresh token, BCrypt hashes,
token-based email verification, password reset that stays silent on unknown
addresses to avoid account enumeration — is worth keeping as designed.

### 6. A migrator that runs before the app (`legacy/backend`)

`DatabaseMigrator` exists so the database can be brought forward *before* the
new containers take over. We keep that operational property — it is explicitly
required — but implement it as a CLI mode of the API host
(`Bjarnoy.Api --migrate`) rather than a startup side effect, so a deploy can run
migrations as a job/init container using the same image and fail the deploy if
they fail.

---

## What we rebuild from scratch

### MongoDB → relational, and Dapper → EF Core

`browsergame` stored the map in MongoDB with `MongoDBRef` cross-document
references and hand-written BSON serialisers; `backend` moved to Postgres but
with Dapper and hand-written SQL per repository, plus Atlas for schema
migrations. Neither survives contact with the requirement in the root README:
the round-based game must run on **SQLite** as a single container *and* on
**Postgres** for multi-tenant hosting.

Hand-written SQL means writing every query twice. EF Core gives us one model
with provider-specific migration assemblies, which is the smaller cost. It also
removes Atlas as a separate toolchain that CI has to install.

### `EntityId`

The legacy `EntityId` is a `readonly struct` wrapping `byte[]`. That has real
problems: `_bytes` is null for `default(EntityId)`, so `Equals`/`GetHashCode`
throw on a defaulted value; `GetHashCode` only reads the first 4 bytes; and it
stores as `BYTEA`, which makes every id unreadable in psql and unusable in a
URL without conversion. `Guid.CreateVersion7()` (time-ordered, so it indexes
well as a primary key) is the good idea in there and it is all we keep.

### Tile modelling

`browsergame` models each terrain as a C# subclass (`GrassTile`, `ForestTile`,
`WaterTile`, …) and asks `tile is WaterTile` everywhere, with the type name
leaking to the client via `GetType().ToString().Split('.').Last()`. With ~14
subclasses this makes the wire format a function of the class hierarchy and
persistence awkward. A `Terrain` enum on a flat tile record replaces it.

### Everything ambient and static

`SettingsController.Instance`, `BuildTechController.Instance`, static
`Noise.Seed`, `Time.Now` as a static clock — the legacy game logic reaches for
global singletons throughout, which is why it has almost no unit tests.
The new domain takes its configuration and its `TimeProvider` as constructor
parameters.

### Logging, JSON, and the host

log4net → `Microsoft.Extensions.Logging` + OpenTelemetry via Aspire's service
defaults. Newtonsoft.Json → `System.Text.Json`. `Startup.cs` → minimal hosting.

### CI

Both legacy projects ship GitLab CI. This repo is on GitHub, and the frontend
already has `.github/workflows/frontend-ci.yml`; the backend gets matching
GitHub Actions workflows.

### Integration tests

`legacy/backend`'s suite has the right *shape* — `WebApplicationFactory` over
the real `Program`, one test class per feature area. But it substitutes
in-memory fakes for every repository, so it never exercises a query, and its
`IntegrationTestBase` does its migration in `[OneTimeSetUp]` against a shared
database, so tests are order-dependent and cannot run in parallel. The rewrite
keeps `WebApplicationFactory` and runs against a real database (SQLite by
default, Postgres via Testcontainers when Docker is present), with each test
class isolated.

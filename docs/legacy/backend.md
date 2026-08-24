# Legacy: `backend` (2025)

Source: `legacy/backend/`

A modernised backend skeleton, started in 2025 to replace the old `browsergame` backend. Stack: ASP.Net Core 9 + PostgreSQL + Dapper, with Atlas for SQL migrations and a GitLab CI pipeline. Primary focus: clean auth plumbing and a multi-world foundation.

---

## What is implemented

### Tech stack

- ASP.Net Core 9 (Minimal API style + MVC controllers)
- PostgreSQL via Npgsql + Dapper
- SQL schema migrations managed with [Atlas](https://atlasgo.io/) (`sql/atlas.hcl`)
- JWT access tokens + rotating refresh tokens
- BCrypt password hashing
- Email verification flow (token-based, 24 h expiry)
- API versioning (`v1`)
- OpenAPI / Swagger schema generation
- Integration test suite (xUnit)
- GitLab CI: build → test → migration check → schema diff → Docker image

---

### Database schema (`sql/migrations/`)

**Users**
```
Id (BYTEA/UUID PK), Username (unique), Email (unique), PasswordHash (bcrypt),
CreatedAt, LastLoginAt, Status (0=Active,1=Inactive,2=Banned), Roles (text[])
```

**Worlds**
```
Id, Name, Status (0=Active,1=Inactive,2=Full), CreatedAt, MaxPlayers, CurrentPlayerCount (joined)
```

**Players**
```
Id, Name, UserId (FK→Users), WorldId (FK→Worlds), CreatedAt, IsActive,
DelegatedToUserId (nullable), DelegationExpiresAt (nullable)
```

**RefreshTokens**
```
Id, UserId (FK→Users), Token (unique), ExpiresAt, CreatedAt, RevokedAt (nullable)
```

**EmailVerifications**
```
Id, UserId (FK→Users), Email, Token (unique), ExpiresAt, CreatedAt
```

---

### Domain models (`BG.Core`)

| Model | Key fields / methods |
|---|---|
| `User` | Id, Username, Email, PasswordHash, Roles[], Status, CreatedAt, LastLoginAt; `Create()`, `UpdateStatus()`, `UpdatePassword()`, `HasRole()` |
| `World` | Id, Name, MaxPlayers, CurrentPlayerCount, Status, CreatedAt; `IsFull()`, `CanJoin()` |
| `Player` | Id, UserId, WorldId, Name, CreatedAt, IsActive, DelegatedToUserId, DelegationExpiresAt; `Create()`, `DelegateTo()`, `RevokeDelegation()`, `IsDelegatedTo()` |
| `RefreshToken` | Id, UserId, Token, ExpiresAt, RevokedAt; `IsValid()`, `Revoke()` |
| `EmailVerification` | Id, UserId, Email, Token, ExpiresAt; `Create()`, `IsValid()` |
| `EntityId` | Wrapper around `Guid`; `NewId()`, `TryParse()`, custom JSON converter, Dapper type handler |

**Enums**
- `UserStatus`: `Unconfirmed`, `Active`, `Inactive`, `Banned`
- `WorldStatus`: `Active`, `Inactive`, `Full`

---

### API endpoints (`BG.API`)

**Auth** — `POST /api/v1/auth/…`

| Route | Description |
|---|---|
| `register` | Create user, optionally skip email verification; returns access + refresh token |
| `login` | Validate credentials, return tokens |
| `verify-email` | Consume email verification token, activate user |
| `refresh` | Rotate refresh token, return new access token |
| `logout` | Revoke single refresh token |
| `logout-all` (auth required) | Revoke all refresh tokens for the authenticated user |
| `request-password-reset` | Send password-reset email (silent if user not found — prevents enumeration) |
| `reset-password` | Consume reset token, update password, revoke all sessions |

**Worlds** — `GET/POST /api/v1/worlds/…`

| Route | Description |
|---|---|
| `GET /worlds` | List all worlds (public) |
| `POST /worlds` (admin) | Create a new world |
| `POST /worlds/{worldId}/join` (auth) | Join a world under a chosen player name; prevents duplicate join |

---

### Infrastructure (`BG.Infrastructure`)

- `PostgreSqlConnectionService` — manages Npgsql connection lifecycle
- `PostgreSqlUnitOfWork` — wraps `IDbConnection` and `IDbTransaction`; all repositories share one unit of work per request
- `DatabaseMigrator` — applies pending Atlas migrations on startup
- Repository implementations: `PostgreSqlUserRepository`, `PostgreSqlPlayerRepository`, `PostgreSqlWorldRepository`, `PostgreSqlRefreshTokenRepository`, `PostgreSqlEmailVerificationRepository`

---

### Services (interfaces in `BG.Core`, implementations wired in `BG.Infrastructure`)

| Interface | Purpose |
|---|---|
| `IPasswordService` | BCrypt hash + verify |
| `ITokenService` | Generate JWT access token; generate opaque refresh token; extract `sub` claim |
| `IEmailService` | Send verification email; send password-reset email |

---

### Integration tests (`BG.Api.IntegrationTests`)

Full round-trip tests using in-memory/test doubles for all repositories and email.

Covered scenarios:
- Registration (happy path, duplicate username/email)
- Login (valid credentials, wrong password)
- Email verification (valid token, expired token)
- Token refresh (valid, revoked, expired)
- Logout / logout-all
- Password reset flow (request + reset)
- JWT user-id claim round-trip
- API versioning (v1 present, unknown version → 400)
- Health check endpoint
- World management (list, create, join, join-when-full, duplicate-join)

---

## OpenAPI contract generation

```bash
npx openapi-typescript https://localhost:7088/openapi/v1.json -o ./src/api/types/apiSchema.ts --enum
```

Used by the Angular frontend (`legacy/frontend`) to generate typed API client bindings.

---

## What is missing / not implemented

- No game mechanics beyond auth and world/player management — no map, no resources, no buildings, no combat
- Player delegation feature exists in the model and DB schema but has no API endpoint
- No game loop / background worker (resource ticks, queue processing)
- `BG.Core/Class1.cs` placeholder — the core library is mostly interfaces; nothing is implemented beyond auth and world management
- No Aspire integration (noted in root README as the intended direction)
- `.Net` version needs an update to latest (noted in root README)

---

## Findings from a close read (2026-08, during the backend rewrite)

Details that only surface from reading the source rather than the summary
above. Recorded here so the next person does not have to re-derive them.

### `EntityId` throws on `default` and hashes only 4 of 16 bytes

`BG.Core/ValueObjects/EntityId.cs` is a `readonly struct` wrapping `byte[]`.
Three consequences:

- `default(EntityId)` has a null `_bytes`, so `Equals`, `GetHashCode` and
  `ToString` all throw `NullReferenceException` on it. Any code path that
  produces a defaulted id — a struct field never assigned, a failed
  `TryParse` whose `out` value is then used, an array element — fails at the
  comparison rather than at the source.
- `GetHashCode` is `BitConverter.ToInt32(_bytes, 0)`, i.e. the first 4 bytes
  only. Those are the *timestamp* bytes of a UUIDv7, so ids minted in the same
  second collide in a hash bucket by construction.
- It stores as `BYTEA`. Ids are unreadable in `psql` output and need conversion
  before they can appear in a URL.

`Guid.CreateVersion7()` underneath is the right call (time-ordered keys index
well); the wrapper around it is not.

### The migrator is never invoked by the application

`DatabaseMigrator` exists and is correct — checksums, a `_Migrations` table, one
transaction per file, a double-check inside the transaction for concurrent
runners. But nothing in `BG.API/Program.cs` calls it. The only callers are
`BG.Api.IntegrationTests`'s `IntegrationTestBase` and, in production, the
GitLab pipeline running the **Atlas** CLI (`.gitlab/ci/migrations.gitlab-ci.yml`)
against the same `sql/migrations` directory. So there are two migration engines
over one directory, and the C# one is effectively test-only.

`ExecuteMigrations` also resolves relative paths against
`Assembly.GetExecutingAssembly().Location`, which is empty for a single-file
publish — the integration tests pass `"./../../../../../sql/migrations"`, five
levels of `..` tuned to the test binary's output path.

### Migration ordering is by filename, and the checksum is never verified

Files are sorted with `OrderBy(Path.GetFileName)` — ordinal string order, so the
`20250304_…`-style prefix is load-bearing and any file that breaks the
convention silently sorts wrong. The checksum is computed and stored on apply
but never compared on subsequent runs, so editing an already-applied migration
is not detected.

### The integration suite never touches a database query

`IntegrationTestBase.ConfigureTestServices` swaps `IUserRepository`,
`IWorldRepository` and `IPlayerRepository` for in-memory fakes
(`TestUserRepository` and friends) whenever `UseMockServices` is set. The suite
therefore covers controller and auth wiring but not a single line of the
Dapper repositories or the SQL they emit — while still paying for a real
migration run in `[OneTimeSetUp]`.

That setup also shares one database and one `TestUserRepository` instance
(captured in a closure) across a class's tests, so the suite is order-dependent
and cannot be parallelised. It is marked `[Category("ResourceDependent")]`,
which is how that is worked around in CI.

### `PostgreSqlUnitOfWork` is scoped, and disposed by its callers

`IUnitOfWork` is registered `AddScoped` and wraps a live `IDbConnection` plus an
optional `IDbTransaction`, so every request holds a pooled connection for its
whole lifetime rather than for the duration of a query.
`IntegrationTestBase.OneTimeSetUp` additionally does
`using var unitOfWork = Scope.ServiceProvider.GetRequiredService<IUnitOfWork>()`
— disposing a container-owned scoped service by hand, which then gets disposed
a second time when the scope ends.

### `World`'s parameterless constructor is `[Obsolete(error: true)]`

`BG.Core/Models/World.cs` marks its deserialisation constructor as an *error*,
not a warning. It compiles today because nothing constructs `World()` in C#, but
it means System.Text.Json can only ever reach it reflectively — and any future
code that legitimately needs it (an ORM materialiser, for instance) fails to
build rather than warns.

### `CurrentPlayerCount` is a joined column on a mutable model

`World.CurrentPlayerCount` is documented as "gets joined in the db" but is a
plain settable property on the same model used for writes, so a `World` that was
loaded without the join carries `0` and can write that back. `IsFull()` reads it,
which makes fullness depend on how the instance happened to be loaded.

### Two API-versioning packages, one of them the deprecated one

`BG.API.csproj` references `Microsoft.AspNetCore.Mvc.Versioning` 5.1.0 and
`…Versioning.ApiExplorer` 5.1.0 — the retired package line, superseded by
`Asp.Versioning.*` 8.x. `Program.cs` uses the old `AddVersionedApiExplorer`
API accordingly.

### Configuration is rebuilt on top of the default builder

`Program.cs` calls `builder.Configuration.SetBasePath(...).AddJsonFile(...)`
for `appsettings.json`, the environment-specific file and environment variables
— all of which `WebApplication.CreateBuilder` has already added. The effect is
that each source is registered twice and the later registration wins, which
happens to preserve the intended precedence but makes the effective order hard
to reason about.

### `BG.Core` has no dependencies — and one leftover file

The core project genuinely compiles with zero package references, which is worth
preserving. `BG.Core/Class1.cs` is the untouched `dotnet new classlib`
placeholder.

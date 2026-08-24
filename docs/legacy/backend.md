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

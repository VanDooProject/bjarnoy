# API keys

API keys let scripts and agents (e.g. a Claude Code session debugging a world)
call the API without a browser session. They are a debug tool: only admins
create keys and approve key requests, on the admin page *API keys*
(`/admin/api-keys`).

## Usage

```bash
curl -H "Authorization: Bearer bjk_…" https://<host>/api/v1/api-keys/self     # what can this key do
curl -H "X-Api-Key: bjk_…"            https://<host>/api/v1/worlds/<worldId>  # alternative header
```

A key acts as its **owner**, a user an admin picks when creating or approving
it: the admin themself, or another account (e.g. a test player), so an agent can
play as that player and pass the settlement/army ownership checks. A key never
grants more than its owner currently has.

## Scoping

A key's effective rights are the intersection of:

| Restriction | Effect |
|---|---|
| Owner | banned owner → 401; locked owner → mutating game actions refused (`ActiveUserEndpointFilter`) |
| Features | per feature `None` / `Read` (GET/HEAD/OPTIONS) / `ReadWrite` (also POST/PUT/PATCH/DELETE); missing → 403 |
| Admin features | `admin.*` features only on an admin-owned key; the key carries the `Admin` role only if it has one |
| Worlds | all worlds, or a list; world-scoped features are checked against the world of the request |
| Rate limit | requests per minute per key → 429 with `Retry-After` |
| Expiry | mandatory, at most `ApiKeys:MaxLifetime` |

Keys are checked against the database on every request, so revoking a key or
banning its owner takes effect immediately. A key that fails authentication
(wrong, expired or revoked) is a 401 on every `/api` route, including anonymous
ones, rather than falling back to anonymous access. Under `/api` a key gets 403
on an unknown path too, since the JSON 404 fallback carries no key marker. Requests made with a key do not
count as the owner's activity (`UserActivityEndpointFilter` skips them).

### Features

`GET /api/v1/api-keys/features` lists them (no login needed).

| Feature | Endpoints | World-scoped |
|---|---|---|
| `worlds` | world map, membership, fog, plot suggestion, renown, own settlements | yes |
| `settlements` | founding, settlement reads, builds, units, feast, quests, runes | yes |
| `armies` | armies, orders, battle/field/camp reports | yes |
| `guilds` | guilds, boards, treaties | yes |
| `trade` | trade offers, shipments, trade reports | yes |
| `leaderboards` | leaderboards, weekly stats | yes |
| `chat` | messages | no |
| `profiles` | profiles | no |
| `simulator` | fight simulator | no |
| `admin.worlds` | admin worlds | yes |
| `admin.settlements` | admin settlements | yes |
| `admin.armies` | admin armies | yes |
| `admin.users` | admin users | no |
| `admin.reports` | admin player reports | no |
| `admin.activity` | admin activity | no |

Every endpoint carries exactly one key marker (a feature, *public*, or
*forbidden*); an endpoint without one is closed to keys, and
`ApiKeyScopePolicyTests` fails the build if a new endpoint forgets it.

- **Public for any key:** `GET /info`, `/buildings`, `/units`, `/auth/me`,
  `/api-keys/features`, `/api-keys/self`, and `POST /api-key-requests/renewal`.
- **Never with a key:** login/register/refresh/logout, the activity heartbeat,
  and all key management and approval endpoints: a key can never create, edit
  or approve keys.

### World scope

For a key limited to some worlds, the world of a world-scoped request comes
from the route (`worldId`, or the world of the `settlementId`, `armyId`,
`guildId`, `treatyId`, `offerId` or report it names), or from a `?worldId=`
query on the endpoints whose handler filters by it (the admin settlement and
army lists, marked `.ApiKeyWorldFromQuery()`); anywhere else the query value
is ignored, so it cannot stand in for a world the endpoint doesn't act on.
A request naming a world outside the list is refused, and so is a
world-scoped request that names no world at all (e.g. the admin settlement
list without `?worldId=`). A resource that does not exist passes through so
the endpoint answers 404 itself.

## Requesting a key (agents)

A tool without a login requests a key and an admin approves it, like a device
login:

```bash
# 1. request: answers with a user code, an approval link and a poll secret
curl -X POST https://<host>/api/v1/api-key-requests -H "Content-Type: application/json" -d '{
  "name": "claude debug world X",
  "purpose": "why the founding on hex (3,-2) fails",
  "description": "Claude Code session for <user>",
  "contextUrl": "https://claude.ai/code/session_…",
  "ownerUserName": "testplayer1",
  "features": { "worlds": "Read", "settlements": "ReadWrite", "admin.settlements": "Read" },
  "allWorlds": false,
  "worldIds": ["<worldId>"],
  "lifetimeMinutes": 60
}'
# 2. show the user code and approvalUrl to an admin; on /admin/api-keys they compare
#    the code, can change owner, features, worlds and lifetime, and approve or deny
# 3. poll every pollIntervalSeconds: 202 pending, 200 with the token (exactly once),
#    403 denied, 410 expired or already picked up
curl -X POST https://<host>/api/v1/api-key-requests/<id>/token -H "Content-Type: application/json" \
  -d '{"pollSecret":"…"}'
```

- `ownerUserName` is a hint; the admin decides the owner (default: the
  approving admin). `description` and `contextUrl` (http/https only) are shown
  on the approval page.
- The key is created at pickup and its token is never stored. Requests expire
  after `RequestTimeout` without a decision or pickup.
- An IP can have `MaxOpenRequestsPerIp` open requests, all requesters together
  `MaxOpenRequestsTotal`.

### Renewal

`POST /api/v1/api-key-requests/renewal`, authenticated with the current key,
requests a new key with the same settings and owner (`{"lifetimeMinutes": 60}`
optional). Pick it up the same way; the old key is revoked then. When
approving, the admin can allow renewals without approval for a period
(*auto-renew*): within it renewals are approved right away, and a renewed key
never outlives that period.

## Admin endpoints

| Endpoint | |
|---|---|
| `GET /api/v1/admin/api-keys?includeInactive=` | list |
| `POST /api/v1/admin/api-keys` | create; answers the token once |
| `PUT /api/v1/admin/api-keys/{id}` | edit settings, token unchanged |
| `POST /api/v1/admin/api-keys/{id}/recreate` | revoke and create a new key with the same settings |
| `POST /api/v1/admin/api-keys/{id}/revoke` | revoke |
| `GET /api/v1/admin/api-key-requests` | open requests |
| `POST /api/v1/admin/api-key-requests/{id}/approve` | approve, optionally with changed settings and auto-renew minutes |
| `POST /api/v1/admin/api-key-requests/{id}/deny` | deny |

These need an admin's browser session (JWT); an API key gets 403.

## Token format and storage

`bjk_<keyId>_<secret>`: the 16 hex char key id is used for the lookup, the
256-bit secret is stored only as a SHA-256 hash and shown once. A random
256-bit secret needs no slow hash. `LastUsedAt` is updated at most once a
minute; requests are tagged `bjarnoy.api_key.id`/`.name` in traces.

Opaque keys rather than JWTs: scopes live in the database, so a key can be
revoked or narrowed at any time and owner changes apply instantly, which a
self-contained JWT could only do with a revocation lookup anyway. The
authentication default is a policy scheme that sends `bjk_` tokens and
`X-Api-Key` to the key handler and everything else to JWT bearer.

The rate limiter is in-memory per API instance, which is enough for a debug
tool on a single instance.

## Configuration

| Setting (env var `ApiKeys__…`) | Default |
|---|---|
| `MaxLifetime` | `30.00:00:00` |
| `MinLifetime` | `00:05:00` |
| `DefaultRequestsPerMinute` | `120` |
| `MaxRequestsPerMinute` | `1200` |
| `MaxActiveKeysPerOwner` | `20` |
| `RequestTimeout` | `00:30:00` (key requests: decision and pickup) |
| `MaxOpenRequestsTotal` | `20` |
| `MaxOpenRequestsPerIp` | `5` |
| `PollIntervalSeconds` | `5` |
| `PublicBaseUrl` | unset: the approval link uses the request's scheme and host |

# Landing page: island-scoped display + backend-owned plot suggestion/reservation

## Problem

1. The landing page's "empty plot" tower/preview scene renders other players'
   already-existing buildings. Root cause: `world.ts:refreshWorldSettlements()`
   fetches every settlement world-wide, then unconditionally paints a
   longhouse + owner-claim + explored-ring on every rival's home tile via
   `WorldModel.registerSettlement()`, with no island filter. A nearby rival on
   a *different* island (or the sparse-world `findLandfall` fallback) can end
   up visually "existing" in the empty-plot hero shot.
2. Rival settlements/plots shown anywhere in the preview should be scoped to
   the current island only — except the real world-map view, which
   legitimately shows the whole world.
3. Plot finding (which hex/island a new visitor is offered) currently runs
   entirely client-side (`unclaimedStartPositions`, `nearestStartPosition`,
   `nearbyStartPositions` in `world.ts`), scanning a world-wide settlement
   fetch. This must move to the backend: the frontend should only request and
   render a suggestion, not compute one.
4. Suggestions must be **pinned across reloads** per visitor, but concurrent
   visitors (e.g. a school signing up in parallel behind one NAT/IP) must not
   collide on the same or spacing-incompatible plots, and must not have their
   first-founder's plot yanked out from under them by a late "recompute".

The atlas lazy-load order (terrain first, building sprites pop in once the
atlas resolves — `HexMapRenderer.ts:1105-1145`, `textures.ts`) is correct and
unrelated to this bug; it must not be touched.

## Existing spacing constants (verified in code, this plan must not diverge from them)

- `SettlementService.MinimumSpacing = 2 * Settlement.MaxClaimRadius + 1`;
  `MaxClaimRadius = ClaimRadius(Longhouse, MaxLevel=10) = 2 + 10/2 = 7` →
  **MinimumSpacing = 15** (`SettlementService.cs`, `BuildingCatalogue.cs`,
  `Settlement.cs`).
- The frontend's `MINIMUM_SETTLEMENT_SPACING = 13` (`world.ts:59`) is already
  **stale/wrong** relative to the real backend rule (it matches an older
  `MaxLevel`). This is an existing latent bug and a strong argument for
  deleting the client-side mirror entirely rather than re-syncing it.
- `FoundAsync`'s two-phase check: phase 1 rejects same-island neighbours with
  `distance < MinimumSpacing` (`TooCloseToNeighbour`) or `distance == 0`
  (`PlotTaken`); phase 2 rejects landing inside any `ClaimDiscsFor(...)` disc
  radius `+ FoundingSafetyMargin (2)`. Relative to a fresh level-1 neighbour
  the effective exclusion is `max(15, 2+2) = 15`.

## Design

### Identity

Three signals, used for different purposes — never conflated:

- **`OwnerId`** (existing `X-Owner-Id` header / `player.id`, stable across
  reloads via localStorage) — the **primary pin key**. One reservation and
  one "last suggestion" memory per `(worldId, ownerId)`.
- **IP** (`X-Forwarded-For`, see below) — a secondary **abuse cap**
  (max distinct owners holding a live *exclusive* reservation per IP).
  Sized generously since a school/office NAT is one IP for many real
  visitors.
- **Fingerprint** — a third, tighter cap dimension aimed specifically at
  incognito-window `OwnerId` churn from the *same device* (which wipes
  localStorage but not IP or fingerprint). Server-side hash of
  `User-Agent + Accept-Language + X-Client-Fingerprint` (an optional header
  the frontend computes from cheap, stable browser properties: screen size,
  device pixel ratio, timezone, language, hardware concurrency, platform).
  Missing header → hash of UA+language only.

Both caps apply **only** to granting the *exclusive* reservation. Hitting a
cap never denies a visitor a suggestion — it's just not held exclusively
(`Reserved = false`), so nobody is ever blocked from seeing/founding, only
from *locking out* others past a reasonable multiplier.

**IP resolution**: enable ASP.NET Core's `ForwardedHeadersMiddleware`
(`X-Forwarded-For`) in `Program.cs`, configured with the deployment's known
proxy/network so `HttpContext.Connection.RemoteIpAddress` reflects the real
client IP rather than the reverse proxy's. Without this, every visitor would
share one IP and the cap would throttle everyone — so this must ship
together with the cap, not after it.

### Two records per owner, two different lifetimes

```
PlotReservation   { WorldId, OwnerId, IslandId, Plot, IpKey, FingerprintKey, ExpiresAt }
  - exclusive, blocks other owners' foundings on the plot's disc
  - sliding TTL, 3 minutes, refreshed on every GET while held

LastSuggestion    { WorldId, OwnerId, IslandId, Plot, ExpiresAt }
  - NOT exclusive, holds no lock, blocks nobody
  - sliding TTL, long-lived (proposed 24h) BUT always re-validated live:
    if the remembered plot is no longer free/valid (someone founded there,
    it fell inside another owner's active reservation disc, or the
    island/world ran out of room and the ring had to move on), it is
    replaced by a freshly computed pin immediately — the 24h is a ceiling,
    not a guarantee. This is what stops a slow/idle visitor from being
    reshuffled to a new random plot on every check-in ("no starvation"),
    while never holding a plot hostage against everyone else.
```

Lookup order on every `GET /plot-suggestion`: (1) live `PlotReservation` for
this owner, else (2) `LastSuggestion` for this owner — in both cases
re-validate against live DB + store state first; if invalid, fall through to
(3) compute a fresh pin. Because every request re-validates, cache-busting
is automatic — there is no manual invalidation step anywhere.

### Reservation disc size vs. real founding spacing

```
ReservationSpacing = MinimumSpacing (15) + FoundingSafetyMargin (2) = 17
```

`17 > 15 > (ClaimRadius(level 1) + FoundingSafetyMargin = 2+2 = 4)`. Two
different owners' pinned plots are therefore always ≥ 17 apart, so once
either one founds, the other's plot still clears both of `FoundAsync`'s
existing phase-1 (≥15) and phase-2 (>4) checks against the brand-new
settlement. The reservation is released only *after* `SaveChangesAsync`
commits, so there is never a window where neither the reservation disc nor
the real DB-backed spacing rule protects a plot. This sizing relationship
gets a dedicated unit test so a future `MaxLevel`/safety-margin change can't
silently invert it.

### Suggestion algorithm

1. World not found → 404. Owner already has a settlement in this world →
   `AlreadyFounded` (frontend routes to the existing settlement instead).
2. Re-validate existing pin (reservation, then last-suggestion) against live
   neighbours + other owners' reservation discs. Valid → reuse.
3. Else compute fresh: order islands by
   `(settlementCount + otherLiveReservationCount) ASC, distanceFromOrigin ASC`
   — spread new players across islands ("1 player per island as long as
   possible") while keeping the existing ring-outward-from-origin order as
   the tiebreak, not replacing it. Within the chosen island, walk its
   (already best-first) start positions for the first one clear of both real
   neighbours and other owners' reservation discs.
4. Up to 5 same-island alternatives, advisory only (not individually
   reserved — clicking one still goes through `FoundAsync`'s real checks;
   accepted trade-off vs. reserving every alternative, which would burn
   island capacity fast against the spread-players goal).
5. Remember the pin as `LastSuggestion` always; additionally `Upsert` an
   exclusive `PlotReservation` (sliding 3 min) unless the world isn't
   joinable or a cap is hit.

### Backend enforcement (not just UI/UX advisory)

`FoundAsync` gains a real rejection: landing inside another owner's live
reservation disc → `FoundingRejection.PlotReserved` → 409. This is enforced
server-side regardless of what the frontend shows. The existing DB unique
index on `(WorldId, CentreQ, CentreR)` remains the final race-arbiter for
literal same-hex races; the reservation narrows the race window for
*nearby* plots, it doesn't replace the index.

Convoy founding (`ArmyService.ResolveFoundingAsync` /
`SettlementService.FoundFromConvoyAsync`) is explicitly **out of scope** —
it uses a separate, pre-existing spacing check and is not wired to
reservations. If a convoy lands somewhere that became part of a new/grown
settlement's territory while it was travelling, that founding fails and the
convoy waits until its food runs out — a wholly separate mechanic.

### Reserved-plot visibility

The landing page shows **only the current viewer's own pinned plot +
alternatives** — never other visitors' live reservations. The backend
already excludes other owners' discs from what any given visitor is
offered, so nobody is ever shown a plot they can't actually take; exposing
other owners' in-flight reservations would be a small information leak for
no UX benefit given ≤3-minute lifetimes.

### Frontend changes

- Delete `MINIMUM_SETTLEMENT_SPACING`, `unclaimedStartPositions`,
  `nearestStartPosition`, `nearbyStartPositions` from `world.ts` — the
  frontend no longer computes spacing/plot-picking at all.
- `WorldModel.registerSettlement` splits into data-only registration vs. a
  new `claimTerritory()` (paints the home-tile building + owner border).
  Territory claiming is scoped to the active/previewed island only for the
  landing/settlement view; the world-map view keeps claiming everywhere
  (`claimAllTerritory()`), which is its legitimate, intended behaviour.
- `LandingView.vue` requests a suggestion from the backend, centers the
  preview on it, and polls (well inside the 3-minute sliding TTL, paused
  when the tab is hidden) so the scene reflects other players founding
  nearby in near-real-time — without re-centering unless the pinned plot
  itself actually changed.

## Out of scope / future work (documented, not built now)

- **Multi-instance backends**: reservations/last-suggestion memory are
  process-local (in-memory store). Behind >1 backend instance a visitor
  pinned on instance A is unknown to instance B. Future remedy: a shared
  store (Redis) behind the same `IPlotReservationStore` interface, or sticky
  routing by `OwnerId`. Single-instance in-memory is correct for today's
  deployment.
- **Convoy founding** integration with reservations — deliberately not
  wired; see above.
- **Bigger-island generation**: the "spread players, 1 per island" ordering
  saturates quickly at current island sizes; a future world-generation change
  (larger islands / target start-position counts) is separate work.
- Optional polish: `?islandId=` filters on `GET /settlements` and the
  suggestion endpoint for an explicit "pick an island" UX.

## Implementation task list

1. `feat(domain)`: tower-aware `Founding.CheckSpacing`, `FoundAsync` refactored
   to use it (behaviour-preserving) + tests.
2. `feat(infra)`: `IPlotReservationStore` + in-memory implementation
   (`PlotReservation` + `LastSuggestion` records, `TimeProvider`-based sliding
   expiry, `ReservationSpacing` constant + sizing test, multi-instance
   remarks documented in code).
3. `feat(infra)`: `PlotReservationService` (re-validate → reuse →
   compute-with-spread-then-ring ordering → alternatives → caps → pin) +
   service tests.
4. `feat(api)`: `GET/DELETE /worlds/{worldId}/plot-suggestion`, fingerprint
   header derivation, `ForwardedHeadersMiddleware` config, DI/options
   binding, endpoint tests.
5. `feat(settlements)`: `FoundingRejection.PlotReserved` enforcement +
   release-on-success + 409 mapping + integration tests (convoy tests
   untouched).
6. `refactor(frontend)`: split `WorldModel.registerSettlement`/
   `claimTerritory`, island-scoped claiming, world-map claims everywhere +
   regression test for the original bug.
7. `feat(frontend)`: plot-suggestion API client + fingerprint header +
   world-store actions; delete client-side spacing logic; rewrite
   `world.test.ts`.
8. `feat(frontend)`: `LandingView` uses the backend suggestion, shows an
   own-plot marker, polls with visibility-pause, handles 409 by
   re-suggesting.
9. `docs`: out-of-scope notes (multi-instance remedy, convoy separation,
   island-generation future) as code remarks.
10. Run `dotnet build`/`dotnet test`, frontend unit tests, and
    `scripts/screenshot-helpers/flow.mjs` screenshots for the PR; verify CI
    green.

## Open questions

1. Default numbers: IP cap 8, fingerprint cap 3, `LastSuggestionTtl` 24h
   (ceiling, always re-validated), 5 alternatives, ~20s landing-page poll
   interval. Adjust if needed.
2. Alternatives remain advisory-only (not individually reserved) — accepted
   trade-off given the "spread players across islands" goal.

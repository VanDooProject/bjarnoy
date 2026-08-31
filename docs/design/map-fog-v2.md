# Fog v2 — design notes (pre-implementation)

Follow-up to the fog v2 planning discussion. This doc captures decisions and
open findings from Phase 0 before any code lands. See
[`map-fog-rendering.md`](./map-fog-rendering.md) for why v1 looks the way it
does — several of its constants (`FOG_MARGIN_HEXES`, `FOG_VISIBLE_MARGIN_HEXES`,
`FOG_VISIBLE_RADIUS_BONUS_HEXES`) survive as generator inputs in v2.

## 1. Layer semantics — confirmed

- **Black fog** (`FOG_SCOUTED`, dark, near-black) = explored, but no realm
  presence / troops there *right now* — "you've been here, can't see it now."
- **White mist** (`FOG_UNEXPLORED`, near-white) = never scouted at all.

This matches the current code (`FOG_SCOUTED` / `FOG_UNEXPLORED`) — no
inversion needed. Confirmed before baking ramp/color logic into the backend
generator, since flipping it later means redoing both the C# and TS ramp
implementations.

### 1a. Guild shared vision — new requirement, not in the original plan

As long as a player is in a guild, they share vision with guildmates. This
means the fog mask's visibility sources are **not** just the requesting
player's own settlements — they're the union of every settlement owned by
every member of the requesting player's guild (guilds already exist
server-side: `GuildEntity`, `GuildService`, `GuildRules`,
`Bjarnoy.Api/Endpoints/GuildEndpoints.cs`).

Consequences for the plan:

- `FogMaskService`'s query changes from "settlements where `ownerId == playerId`"
  to "settlements where `ownerId` is a member of `player`'s guild."
- The mask's cache/version key becomes guild-shaped, not player-shaped:
  `(worldId, guildId ?? playerId, sorted [settlementId, q, r, level])` — a
  player with no guild falls back to just their own settlements.
- The version hash must invalidate when **any** guild member's settlement
  changes (founded, leveled, lost), not just the requesting player's own —
  a materially bigger fan-in than a single-player cache key.
- Leaving/joining a guild must force a mask refetch (bump `fogVersion` in
  the store) even though the player's own settlements didn't change.

## 2. Layer stack — resolves the `fogWorld` hack

Current stage order (`HexMapRenderer.mount()`):

```
app.stage: [fogPatternSprite, world(tiles+borders), markerLayer, fogWorld(fog)]
```

`fogWorld` exists solely because fog needs to paint *above* `markerLayer` in
some places while the renderer's module comment admits it *also* needs to sit
*beneath* it in others — hence a second world-space container kept in
lockstep with `world`'s transform every frame (`applyCameraTransform`), just
to get paint order right. That's real complexity paid for a single-mask
design.

Splitting fog into **two independent mask layers** (black-fog quad,
white-mist quad — either two `FogMaskLayer` instances or one layer that
draws two passes) removes the hack outright, because each is genuinely
screen-space and can be inserted anywhere in `app.stage`'s child order
without transform-syncing to anything:

```
app.stage:
  tiles
  borders
  buildings/toppings
  blackFogLayer      (out-of-sight tint)
  markerLayer         (names, troops, waypoints)
  whiteMistLayer      (never-scouted mist)
```

This also matches the layer list from the conversation directly and gives a
real gameplay property for free: troops/waypoints/names render *through*
the dark "explored but out of sight" tint (arguably correct — you remember
the terrain, you don't currently see units on it, so showing stale unit
markers there would be wrong anyway and this ordering makes it trivial to
decide either way per-layer) but stay hidden under white mist, which is
exactly "never been there → nothing to show." No `fogWorld`, no per-frame
`copyFrom` transform sync, no ordering hack — delete that whole subsystem
in the same phase the mask layers land, rather than carrying it forward.

## 3. Splitting `world` into tiles / borders / buildings

Currently `world` is one container holding terrain sprites, `borderLayer`,
and (implicitly, undifferentiated from tiles) buildings — see
`HexMapRenderer.ts:1258-1268`. Worth splitting into three containers with
different invalidation cadences, mirroring the fog mask split:

- **tiles** — terrain sprites. Changes only when new hexes come into view or
  (rarely) terrain itself changes. Cheapest to leave untouched across
  rebuilds.
- **borders** — realm-influence polygons. Changes whenever settlement
  level/ownership changes — i.e. on the *same* trigger that invalidates the
  fog mask. Since border extent today is computed from the same
  `borderRadius(settlement)` distance math the fog generator now owns
  server-side, **border geometry is a natural sibling to precompute on the
  backend alongside the fog mask** — either as a second small texture/mask
  or as vector polygons returned with the same version/ETag. Not required
  for fog v2, but flagged here because the invalidation trigger is
  identical and doing it later means re-deriving the same distance-transform
  logic a second time.
- **buildings/toppings** — placed structures. Changes when a building is
  placed/upgraded; independent of both tiles and borders.

Splitting these means a border update (settlement level-up) no longer forces
re-touching the tile container, and vice versa — each container's rebuild
is scoped to its own invalidation source instead of one `rebuildAll()`
pass. This is a `HexMapRenderer.ts` refactor independent of the fog mask
work; sequence it either just before or just after Phase 4 (shader layer),
since fog v2 already touches paint order in `mount()`.

## 4. Performance findings (write-down only — not scheduled)

From reading `HexMapRenderer.ts` while planning fog v2:

- **No tilemap batching library is in use.** `package.json` has no
  `@pixi/tilemap` or similar; terrain is individual `Sprite`s in a plain
  `Container` (`world`), synced via a hand-rolled pool (`syncSpriteLayer`).
  Pixi v8 batches same-texture sprites automatically within a container, so
  this may already be fine — but if terrain draw calls ever show up as a
  bottleneck in `FogPerfPanel`-style profiling, `@pixi/tilemap` (or Pixi v8's
  batched `Graphics`/`RenderLayer` APIs) is the first thing to reach for
  instead of hand-optimizing the sprite pool further.
- **No `ParticleContainer` for markers.** `markerLayer` is a single
  `Graphics` object with pooled child `Sprite`s (troop icons, labels,
  waypoint lines) manually added/removed. Fine at current unit counts;
  worth revisiting with `ParticleContainer` (or Pixi v8's `RenderLayer`) if
  the game ever has large-scale battles with many simultaneous troop
  markers on screen.
- **No `cacheAsTexture`/render-texture caching for `borderLayer`.** Border
  polygons are redrawn via `Graphics.poly().fill()` on every
  `rebuildBordersAndFog()` call, i.e. on every camera move — same rebuild
  cadence fog v1 pays for its blob layer. Once borders are decoupled from
  tiles (§3) and only rebuilt on actual ownership/level changes rather than
  camera movement, this mostly resolves itself; if not, `generateTexture`
  caching (the same pattern `createFogBlobTexture`/`fogBlobCacheTexture`
  already use) is the fallback.
- **`generateTexture` calls happen at the right cadence today** — once per
  shared shape (`createFogBlobTexture`, `createFogPatternTexture`), not
  per-hex — so no finding there; fog v2 keeps this property by construction
  (the mask is one texture fetched over the network, not generated
  per-rebuild).

None of these are blocking fog v2 and none are being scheduled now — they're
independent renderer-performance opportunities surfaced while reading the
code for this plan, kept here so they aren't re-discovered from scratch
later.

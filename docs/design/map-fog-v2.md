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
- The version hash must invalidate when **any** guild member's settlement
  changes (founded, leveled, lost), not just the requesting player's own —
  a materially bigger fan-in than a single-player cache key.
- Leaving/joining a guild must force a mask refetch (bump `fogVersion` in
  the store) even though the player's own settlements didn't change.

**Caching, corrected.** A guild-wide BFS re-run on every single member's
level-up is wasteful — the expensive step (the distance transform) doesn't
need to redo for every member just because one of them changed. Instead:

1. **Per-player static buffer, cached individually.** Each player's own
   settlement-derived distance values (not yet ramped/PNG-encoded), keyed by
   `(playerId, sorted [settlementId, q, r, level])`. Invalidates only when
   *that player's own* settlements change — small, rare, cheap.
2. **Guild-facing mask = elementwise max-merge of its members' cached
   buffers**, then ramped/encoded once. `O(width × height × guildSize)`,
   trivial next to re-running the BFS. Cache this composite too, keyed by
   `(guildId, sorted memberVersions)`, so repeat requests still hit cache —
   but on a cache miss (any one member changed), only the merge reruns, not
   the transform.
3. A player with no guild skips the merge step entirely — their "guild
   mask" is just their own per-player buffer, ramped directly.

### 1b. Static-layer caching (B) + live-layer isolation (C) compose

B answers "how is the *static*, settlement-derived layer cached cheaply
across a guild." C (below) answers "how do we stop the *live*, army-derived
layer from invalidating that cache." Together: the static mask stays
cheap and rarely invalidates (B), while the thing that changes every frame
never touches the cache at all (C). Doing only B still re-bakes a texture
on every army step; doing only C still over-invalidates the static layer
on every member's settlement change. Both are needed.

### 1c. Live army-granted vision — not implemented today, design for it anyway

Checked: nothing in `WorldModel.ts` currently derives visibility from army
position — `explored`/`visibleHexes` are purely settlement-derived. But
army-granted vision (see troops seeing what they're standing near) is a
natural next feature, and there's already a live-position channel for it
("Waypoint arrows + live troop movement visualization"). If it lands inside
the *same* mask/cache as settlements, it's a correctness trap: a busy guild
with several armies in transit would bust the cached mask on every movement
tick, defeating the ETag/304 scheme entirely — the opposite problem from
§1a's guild fan-in, and worse, because movement ticks far more often than
settlement level-ups.

**Keep it out of the cached texture entirely.** Ship live army positions as
a small uniform array (`vec3[] armyVisionSources`, a handful of entries —
current armies in transit, well within any reasonable uniform array size),
updated per-frame like the camera or wind-drift uniforms, and composited
**in the fragment shader** against the static cached mask — a few cheap
distance checks per fragment, same cost class as the noise warp
(sub-0.1&nbsp;ms). This is the same principle as §2.8 of the original plan
(wind drift is a uniform update, not a mask regen) applied to a second
input: merging is only cheap when it happens per-fragment at render time,
not by re-baking a texture, so movement never touches the cache at all.
Army position itself needs no new backend computation — it's computed
client-side today via continuous interpolation
(`lerpPoint`/`routeProgressAt` in `armyProgress.ts`, plus a `resyncFrom`
easing transition on re-sync), which vision reuses directly.

### 1d. Why PNG, not JSON, for the static mask

Only the *static* layer is ever image-encoded, and only on a real cache
miss (§1b) — not per request, never per frame. Worth confirming PNG is
actually cheaper than the obvious alternative (a JSON array of distance
values) rather than assuming it:

- **Wire size.** A dense per-texel field (~30K values for a typical world)
  as JSON numbers costs several bytes per value even for small integers.
  PNG's filter+DEFLATE crushes the mask's large uniform runs (most of a
  world is either fully-explored or fully-unknown) to a few KB. A raw
  octet-stream + gzip fallback (already noted as an alternative in the
  original plan) compresses similarly without needing an image codec
  dependency, and is also far smaller than JSON.
- **Decode cost.** `JSON.parse` over tens of thousands of numbers runs on
  the main thread and is slower than PNG decode via `createImageBitmap`,
  which the browser does off the main thread.
- **Encode cost.** PNG-encoding a ~120×242 image that's mostly uniform is
  low-single-digit milliseconds with a reasonable encoder — and this only
  runs on a cache miss, which §1b's memoization already keeps rare.

JSON would only win if the mask were sparse (a short list of "these hexes
changed"), which it isn't — it's a dense field over the whole world, so an
image/binary format beats a text format on every axis here.

**Keep the vision source as a continuous float — do not snap it.** The
renderer already computes army position this way every frame
(`lerpPoint`/`routeProgressAt` in `armyProgress.ts`, plus a `resyncFrom`
easing transition), specifically to avoid visible jumps; reusing that
float position for vision is free and snapping it would reintroduce
exactly the popping the interpolation exists to prevent — the fog edge
would jump hex-to-hex as an army crosses a boundary instead of sliding.

This doesn't conflict with hex-granular consumers (`isExplored(q, r)`,
`isPastTerrainCull`) needing a boolean per hex — that's a question of
**query granularity**, not source granularity. Those consumers evaluate
the *same continuous distance formula* at the hex's center point rather
than requiring the army's position itself to be discretized. The source
stays float and smooth; only the answer, when a hex-shaped answer is
asked for, is hex-shaped.

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

## 3. Splitting `world` into tiles / borders / buildings — adopted

Currently `world` is one container holding terrain sprites, `borderLayer`,
and (implicitly, undifferentiated from tiles) buildings — see
`HexMapRenderer.ts:1258-1268`. This split is settled, not just proposed:
into three containers with different invalidation cadences, mirroring the
fog mask split.

### Why borders redraw on every camera move today — traced, not assumed

This isn't old code carrying debt — `HexMapRenderer.ts` and the fog fixes
in it are two days old (first commit 2026-08-29, this plan written
2026-08-31). The coupling was there from the start and got patched with
throttling instead of being decoupled:

- Border stroke widths are **world-space units** (`width: 7`, `width: 2.5`
  at `HexMapRenderer.ts:2702,2706`), drawn into `borderLayer` inside
  `world`. `world` is scaled as a whole by the camera transform, so a pure
  zoom already rescales existing strokes for free — no redraw needed for
  that.
- The actual cause: `rebuildBordersAndFog` computes borders *and* fog in
  one loop over `visibleCoords()` (viewport-culled), and Pixi's
  `Graphics.clear()` has no partial-update API — it wipes every path. Any
  camera change past `cameraMovedEnough()`'s threshold (`> TILE_W*0.4` pan,
  or `|Δzoom|/zoom > 8%`) forces a full clear-and-redraw of every border
  edge on screen, even when no border actually changed.
- Zoom crossing that 8% threshold triggers the same full rebuild as pan,
  even though `visibleCoords`' own margin (`TILE_W*2` past the viewport
  edge) often already covers the new zoom level without a single new hex
  entering view — a zoom-only gesture frequently pays for a full
  border+fog rebuild it doesn't need, purely because both are computed in
  the same viewport-scoped pass.

Splitting borders into their own container, invalidated only by
ownership/level events (not `cameraMovedEnough()`), removes this class of
redraw entirely — zoom relies on the free transform rescale, and pan only
touches borders when a hex with different ownership actually enters the
margin.

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

# Fog v2 — design notes (pre-implementation)

Follow-up to the fog v2 planning discussion. This doc captures decisions and
open findings from Phase 0 before any code lands. See
[`map-fog-rendering.md`](./map-fog-rendering.md) for why v1 looks the way it
does — several of its constants (`FOG_MARGIN_HEXES`, `FOG_VISIBLE_MARGIN_HEXES`,
`FOG_VISIBLE_RADIUS_BONUS_HEXES`) survive as generator inputs in v2.

**Terminology note.** "Border" is overloaded in this codebase — §5 below
means *realm borders* (political ownership polygons, `borderLayer`). Where
this doc talks about the edge of the fog/vision mask itself (where visible
turns to fogged), it says **fog boundary** or **vision edge**, never
"border," to keep the two concepts apart.

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

**Option B — per-player cache, cheap merge.** A guild-wide BFS re-run on every single member's
level-up is wasteful — the expensive step (the distance transform) doesn't
need to redo for every member just because one of them changed. Instead:

1. **Per-player static buffer, cached individually.** Each player's own
   settlement-derived distance values (not yet ramped/PNG-encoded), keyed by
   `(playerId, sorted [settlementId, q, r, level])`. Invalidates only when
   *that player's own* settlements change — small, rare, cheap.
2. **Guild-facing mask = elementwise max-merge of its members' cached
   buffers**, then ramped/encoded once. Computed per chunk (§3), not over
   the whole world — `O(chunkWidth × chunkHeight × guildSize)`, a few
   thousand ops even at a large guild size — trivial next to re-running
   the BFS. Cache this composite too, keyed by
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

### 1c. Option C — live layer, never cached, composited in the shader

Live army-granted vision — not implemented today, design for it anyway.

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
(sub-0.1&nbsp;ms). This is the same principle as §2.4's wind-drift uniform
(a uniform update, not a mask regen) applied to a second
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
exactly the popping the interpolation exists to prevent — the vision edge
would jump hex-to-hex as an army crosses a boundary instead of sliding.

This doesn't conflict with hex-granular consumers (`isExplored(q, r)`,
`isPastTerrainCull`) needing a boolean per hex — that's a question of
**query granularity**, not source granularity. Those consumers evaluate
the *same continuous distance formula* at the hex's center point rather
than requiring the army's position itself to be discretized. The source
stays float and smooth; only the answer, when a hex-shaped answer is
asked for, is hex-shaped.

### 1e. Persisted explored history — third input, adopted

An external review of this doc caught a real gap: §1 defines black fog as
*history* ("you've been here, can't see it now"), but Option B's cache key
— `(playerId, sorted [settlementId, q, r, level])` — is a pure function of
**current** settlements. A pure function of current state has no memory.
Checked against v1: `WorldModel.explored` (`WorldModel.ts:104`) is a `Set`
that is only ever `.add`-ed (`:270`, `:435`) — monotonic, accumulated
client-side, never shrinks. §1a/§1b silently replaced that accumulator
with a stateless projection.

The sharper version of the same gap: §1c puts army vision entirely in the
shader, never written back to the cached mask. So ground an army marches
across reverts to "never scouted" the instant the army moves on — which
defeats the entire point of scouting with troops.

**Resolved: the scouting/explored mask is saved per player and extended
when troops move through new territory.** This is a genuine third input
alongside B and C, not an extension of either:

- **Storage.** A persisted, per-player, per-chunk explored bitset —
  one bit per texel (§2.1's doubled-row layout — a texel is a doubled-row
  cell, not one-per-hex, see §2.1),
  OR-ed into over time, never cleared by a settlement leveling or an army
  moving on. A real table/blob, not a derived value: `PlayerExploredEntity`
  or similar, keyed `(playerId, worldId, chunkCoord) → byte[]`.
- **Growth.** Whenever an army's live position (§1c) enters a hex not yet
  in that player's persisted set for the relevant chunk, that hex gets
  OR-ed in — same trigger as the live-vision uniform array update, just
  also written back instead of only driving the per-frame shader
  composite. Settlement founding/leveling still OR-in the current
  `exploredRadius` ring the same way it always has.
- **Composition.** The static mask a player/guild sees is now: persisted
  explored history (this section) **OR** current settlement rings
  (Option B) **OR** current live-army radius (Option C, still shader-only
  and never persisted — army vision is a real-time bonus, not itself a
  memory; the *ground it reveals* becomes memory only once the walked hex
  is OR-ed into the persisted set above). "Currently in sight" (the
  visible/not-fogged distinction, vs. merely explored/dark-fogged) still
  reads from B+C as before — this section only changes what counts as
  "explored at all" (white mist vs. black fog), not what counts as
  "currently visible" (black fog vs. no fog).
- **Caching consequence.** The persisted layer is append-only, so it
  doesn't need version-hash invalidation the way B's settlement-derived
  buffer does — a write is just "OR this hex's bit in," and the cached
  guild/player mask for an affected chunk is bumped the same way any
  other write to that chunk invalidates it (§3's per-chunk cache). It
  does **not** get resurrected by ownership loss, guild-leave, or any of
  §1a's "lost" cases — history is per-player and sticky by design; only a
  player's own OR-ed hexes are theirs, so a guild-leave still correctly
  drops the *other* members' contributions (their settlement rings, their
  walked hexes) from what gets merged for that player going forward,
  without touching what that player personally OR-ed into their own
  record.

### 1f. What fog is protecting — current state, not terrain shape

The same review flagged that `GET /api/v1/worlds/{id}/tiles` has no
`RequireAuthorization` and serves terrain shape/orientation freely
(`TileResponse(Q, R, Terrain, IsCoastalWater, Orientation, Variant)` —
`WorldContracts.cs:126`, verified: no ownership, building, or troop field
on it at all). That's fine, not a leak: island *shapes* being visible is
intentional — most likely to support a landing/getting-started experience
that shows the world before a player commits to founding — and fog was
never meant to hide geography. What fog is actually for is hiding
**current state**: whose settlement is where, what's built, where troops
are — the things that change and that knowing gives a real gameplay
advantage. `/tiles` not being gated is consistent with that scope, not a
bug in it.

Consequence for this design: the fog mask endpoint itself (§3) must still
be properly authenticated and player/guild-scoped — that was always the
plan and doesn't change — but it doesn't need to defend terrain geometry,
only the settlement/army-derived signal layered on top of it.

**Found while checking this: the landing page is exactly the leak §1f
warns about, today, in scope for this doc.** `unclaimedStartPositions()`
(`stores/world.ts:269`) calls `this.model.listSettlements()` — the
*entire* world's settlement list — purely to compute which start plots
are free, and that list (`SettlementSummary(Id, Name, OwnerName, Q, R,
LonghouseLevel, IslandId)`, `SettlementContracts.cs:236`) hands over
every established player's real name, position, and level, before that
player has even logged in, with no auth gate. This isn't a hypothetical
future risk — it's the current landing-page implementation.

**Fix: a dedicated, minimal landing/founding-availability endpoint that
returns only availability, never who or what.** `GET
/api/v1/worlds/{worldId}/start-positions` (or similar), response shape
along the lines of `{ islandId, availablePositions: [{q, r}] }[]` — no
`OwnerName`, no `LonghouseLevel`, no established player's `Q`/`R`. The
server computes the same filtering `unclaimedStartPositions()` does
client-side today (spacing check against existing settlements per
island), but returns only the yes/no result per start position, not the
settlement data that filtering was derived from. This replaces the
client-side computation entirely — the landing page stops fetching
`listSettlements()` at all.

**Also folds in beginners' protection, currently unimplemented.** An
island should only appear available if it has no settlements at all, or
only settlements still within a beginner-protection window after
founding (a new concept — needs a `ProtectionEndsAt` or similar on
`SettlementEntity`, set at founding time). The same endpoint is the
natural place to apply that filter: an island whose only settlements are
past protection simply doesn't appear in the response, with no
distinction exposed between "occupied by an established player" and
"never available" — the landing page never needs to tell those apart, it
only needs "here is where you can click." This is the first concrete
consumer of "current state" in the codebase that fog v2's security
framing (start of this section) needs to hold for, so it belongs in this
doc rather than deferred as unrelated cleanup.

One separate, pre-existing question this doc still does **not** resolve
and treats as out of scope: whether the settlement-listing endpoints
*other* callers use (world map view, guild rosters, etc., for an
authenticated player who has already founded) are properly scoped. That's
an existing-endpoint audit; the landing-page fix above is scoped narrowly
to the one genuinely pre-authentication, current-state-exposing path.

## 2. Rendering mechanics — inlined (closes the "original plan" gap)

Everything in §1 and §3 onward repeatedly cited "the original plan" for
the mask's coordinate space, channel layout, and shader design — that
material only ever existed in chat, never in this repo. Inlined here so
the doc is self-contained and ticket-able.

### 2.1 Mask coordinate space

`isoGridPosition` (`src/frontend/src/lib/hex/geometry.ts`) places hex
`(col, row)` in odd-q offset space at `x = col * 0.75 * TILE_W`,
`y = row * TILE_H + (col & 1 ? TILE_H/2 : 0)`. A naive `(col, row)`
texture needs a per-column half-row shift in the shader, which breaks
bilinear filtering across column boundaries. Instead, use a **doubled-row
staggered space**: `u = col`, `v = 2*row + (col & 1)`. This is an exact
affine world→texel map, no branching:

- every real hex lands on an integer texel where `(u + v)` is even
- the interleaved `(u + v)`-odd texels sit exactly between four hexes —
  the generator fills them with the average of their four diagonal hex
  neighbours, so hardware bilinear filtering interpolates correctly
- cost: 2× texels vs. hex count, still trivial
- **texel/hex mapping, resolved**: one texel per doubled-row cell, real
  hexes on even-parity cells, the odd-parity interpolation-fill cells in
  between — not one texel per hex. Every size estimate in this doc (the
  ~121×242 texel default-world box, chunk-count arithmetic in §3) already
  uses this doubled convention.

### 2.2 Mask format

RGBA8, one texel = one doubled-row cell:

| Channel | Contents |
|---|---|
| R | `unknown` ramp — `0` fully explored → `255` fully unknown |
| G | `outOfSight` ramp — `0` currently visible → `255` fully out of sight |
| B | per-hex stable noise seed (deterministic per-hex warp variation without a second lookup) |
| A | reserved (future third vision tier, e.g. ally-shared) |

Both R and G are baked as continuous *ramps* (not booleans) in the
generator, using the margin constants already in `map-fog-rendering.md`
(`FOG_MARGIN_HEXES`, `FOG_VISIBLE_MARGIN_HEXES`). Baking the ramp, not a
boolean, is what keeps the shader free of distance math or jitter
constants — see §2.4.

### 2.3 Backend generator

A multi-source BFS/chamfer distance transform over the hex grid from each
vision-source's ring boundary — O(hexes), not O(hexes × sources). For the
default world (~15K real hexes) this is sub-millisecond. Pure function:
`(sources: [(q, r, exploredRadius, visibleRadius)], persistedExplored:
bitset) → distance buffer`, so it can be unit-tested with fixed golden
fixtures shared between the C# generator and the demo-mode TS port (§1a's
duplication concern).

### 2.4 Client shader

One Pixi v8 `Mesh` + custom `Shader` per fog tier (§4's two-quad design),
screen-space, sampling the stitched mask texture (§3). Uniforms:
`uCamera`, `uViewport`, `uWorldToMask` (the §2.1 affine, scale+offset),
`uColors` (the `FOG_UNEXPLORED`/`FOG_SCOUTED` RGB + scouted alpha),
`uWarp` (amplitude in hexes, two noise octave scales), `uTime`, `uWind`,
`uArmyVisionSources[]` (§1c's live layer), `uMaskBlend` + `uMaskPrev`
(the reveal cross-fade, below).

Fragment shader, roughly:

```
screen -> world     (inverse of camera.ts's worldToScreen)
world  -> maskUV     (uWorldToMask, affine, no branching)
warp = (noise(maskUV*s1 + uTime*uWind) - 0.5) * uWarp.x
     + (noise(maskUV*s2 - uTime*uWind*0.6) - 0.5) * uWarp.x * 0.4
m = texture(uMask, maskUV + warp)
liveVision = max over uArmyVisionSources of
             smoothstep(radius, radius - falloff, distance(worldPos, source.xy))
unknown    = smoothstep(0, 1, m.r)
outOfSight = max(smoothstep(0, 1, m.g), 0) * (1 - liveVision)
rgb   = mix(SCOUTED_RGB, UNEXPLORED_RGB, unknown)
alpha = max(unknown, outOfSight * SCOUTED_ALPHA)
out   = vec4(rgb * alpha, alpha)   // premultiplied
```

The UV warp is what replaces every per-hex jitter constant in v1
(`FOG_DIST_JITTER_HEXES`, `FOG_CULL_JITTER_HEXES`,
`FOG_VISIBLE_JITTER_HEXES`, the blob jitter/overlap family) — because it
displaces *where a continuous ramp is sampled from* rather than jittering
a per-hex threshold comparison, it cannot push a value past its own
ramp's endpoints, which structurally rules out the v1 bug class where a
jitter larger than its ramp bled black fog into the player's own realm
(`map-fog-rendering.md` problem 6a).

### 2.5 Half-res render pass — mandatory, not a CI-only shortcut

`map-fog-rendering.md` documents a real, reproducible hazard: a per-frame
`BlurFilter` on software-rendered headless Chromium stalled the main
thread badly enough to time out `page.mouse.move` in CI. Per `CLAUDE.md`,
the render path must not branch on "is this a software renderer" — so the
fix has to help everyone, unconditionally: render the fog pass into a
`RenderTexture` at half resolution and upsample with a plain sprite,
always, the same trade `FOG_BLOB_CACHE_SCALE` already makes in v1 for the
same reason (fog is low-frequency; there's nothing to lose visually). No
sizing measurement exists yet for the *shader* pass specifically — that's
a real, open gap — the pass needs its own perf measurement on
software-rendered CI before Phase 4 ships, not deferred as a "measure it
later" — but the mechanism itself is settled: unconditional, not
test-gated.

### 2.6 Reveal cross-fade (also serves §1e's "fog can light up animated")

Mask updates keep the previous texture bound as `uMaskPrev`, animate
`uMaskBlend` 0→1 over a fixed duration, then drop the old texture. This
covers both a settlement's founding reveal (today's `FOG_REVEAL_FADE_MS`
constant) and, per §3's missing-chunk-default handling below, a chunk arriving after
having briefly rendered as default-unknown — the same mechanism handles
"newly explored" and "just finished loading" identically, so a fetched
chunk doesn't need to *pop* in, it fades in exactly like a founding
reveal does today.

### 2.7 WebGPU note

Pixi is `^8.20.0`; `app.init()` currently defaults to WebGL, so a
`GlProgram` (GLSL) is sufficient for the shader above. If the renderer
preference is ever switched to WebGPU, a parallel `GpuProgram` (WGSL)
source is required — Pixi v8 does not auto-translate one to the other.
Flagged here so it's a deliberate decision at that point, not a surprise.

### 2.8 Debug/perf panels must be rebuilt, not just left running

`FogDebugPanel.vue`/`FogPerfPanel.vue` and the `FogDebugFlags`/
`FogPerfStats` interfaces they drive (`HexMapRenderer.ts:137-220+`) are a
genuinely good existing tool — 12 flags, ~16 measured fields — but every
one of them instruments the per-hex loop and blob cache this doc deletes.
Left as-is after the cutover, the panel would silently go stale: flags
like `distJitter`, `terrainCullJitter`, `scoutedTintFade`, `flatFillOnly`
and stats like `bordersFogMs`, `blobCacheMs`, `deepFogOnly`,
`*HexCount` all name mechanisms (jitter constants, the blob cache, the
per-hex branch) that no longer exist once §2.4's shader replaces them.
This needs deliberate replacement, not deletion-by-neglect:

**Flags → shader-era equivalents**, each toggling a real, still-existing
knob rather than a deleted one: `maskUnknown`/`maskOutOfSight` (isolate
each tier, same purpose as today's `unexploredFog`/`scoutedFog`), `warp`
(the §2.4 UV warp on/off — direct successor to `distJitter`), `drift`
(the §1c-adjacent wind uniform on/off), `showRawMask` (bypass the warp
entirely, render the mask texture unmodified — useful for debugging chunk
stitching seams, §3), `halfResPass` (force full-res, for comparing
against §2.5's mandatory half-res pass when diagnosing a visual
difference). `realmBorders` survives unchanged — §5 doesn't touch what it
gates, only when it redraws.

**Stats → what's actually happening now**: `maskFetchMs` (network,
per chunk), `stitchMs` (client-side texture assembly, §3), `shaderPassMs`
(the §2.5 half-res fog draw — this is the number that needs measuring on
software-rendered CI before Phase 4 ships, per §2.5's own open gap),
`cacheHitRate` (surfaced from the server via a response header or the
`/meta` endpoint, not measured client-side — this is where B/C's whole
caching design either pays off or doesn't, and it should be visible),
`chunksInFlight`, `maskVersion`. The old per-branch hex counters
(`unexploredHexCount`, `scoutedHexCount`, `borderedHexCount`) have no
replacement — there is no per-hex branch left to count — and shouldn't be
faked; their absence is itself informative (the whole point of the
rewrite is that this stops being a per-hex cost).

This is Phase 6 work in the original phased breakdown (cut over once v1
is fully deleted, not before — a mid-cutover panel showing half-real,
half-stale data is worse than the old one), but it's listed here as a
concrete requirement so it doesn't fall through as "obviously implied."

## 3. Chunked mask delivery — adopted, not deferred

The earliest version of this plan (now inlined as §2) shipped one
whole-world texture and left an axial-rectangle query on the endpoint as
a future escape hatch if a world ever got too big. Upgrading this to
genuinely chunked delivery from the start.

**The primary driver is server-side, not client bandwidth.** Client-side
stitching (§ below) is cheap — well under the cost of the network fetch it
rides on — so it was never the bottleneck being solved. The real saving is
on the server: with a monolithic whole-world mask, one settlement changing
on one edge of the map still means re-running the merge (Option B) and
re-encoding a PNG over the *entire* world, and touches the *entire*
per-guild cache entry. With chunks, only the handful of chunks near that
settlement need their DB query, merge, and encode redone — the DB read and
compute scale with the size of the change, not the size of the world.
Client bandwidth savings (only fetching what's in view) and painless world
growth (chunks are additive, a monolithic texture isn't) are real, but
secondary, benefits of the same design.

### Mechanics

- Fixed-size chunks (e.g. 32×32 or 64×64 texels) addressed by chunk
  coordinates, aligned to the doubled-row affine layout (§2.1) so chunk
  boundaries fall on that grid's integer lines and chunks tile without
  gaps.
- Each chunk independently PNG-encoded, cached, and ETag'd — same §1a
  (Option B) and §1d
  mechanics, just scoped per chunk instead of per world. This also shrinks
  **invalidation scope**, not just fetch size: a settlement's level-up
  only dirties the handful of chunks within its (radius + margin), so
  Option B's per-player buffers can be cached and merged per-chunk too,
  rather than the whole per-player field being touched on every change.
- Chunk generation needs a **source halo**: a settlement just outside a
  chunk's bounds can still shade pixels near that chunk's edge if it's
  within vision range, so the generator's per-chunk source query expands
  by the max vision radius before computing that chunk's distance field —
  the same "expand by margin" pattern `visibleCoords`' `TILE_W*2` margin
  already uses in the current renderer.
- **Client fetches only chunks intersecting its viewport + margin**,
  batched in one request (mirroring the existing
  `GET .../tiles?qMin&qMax&rMin&rMax` rectangle-query pattern already on
  `WorldEndpoints.cs`), not N separate round trips per chunk.
- **Missing/not-yet-fetched chunks default to fully-unknown** (`unknown
  ramp = 1.0`, `outOfSight = 0`) — the same value a chunk with no sources
  at all would compute anyway, so it needs no special-casing in the
  shader or the stitcher. A chunk that hasn't arrived yet, or one the
  server has never had reason to generate (no source ever queried it),
  reads as "never scouted," which is always correct and never leaks
  information — the stitched texture can be rendered before every chunk
  in view has arrived, filled in progressively as chunks land. That
  progressive fill-in is intended, not a defect to hide: §2.6's reveal
  cross-fade means a chunk arriving after a moment of default-unknown
  *lights up* rather than pops, the same way a founding reveal already
  animates in today. Defaulting to unseen is correct and stays correct
  even for a chunk that takes a moment to load.

  The one thing this default doesn't cover well: a chunk covering ground
  the *requesting player has themselves already explored* (§1e) briefly
  reading as unknown purely because the network hasn't returned yet —
  that's not a wrong default, it's a loading-latency gap, and it's why
  §1e's persisted explored history matters here specifically: prefetch a
  player's own persisted explored set eagerly on session start (it's
  their own accumulated history, much smaller than the whole world) so
  their own territory doesn't wait on a per-chunk round trip the way
  freshly-unseen territory correctly does.

### Backend cache control — compute cache, not HTTP cache

This is an SPA: the client already knows exactly when to ask for a new
chunk (a `fogVersion`/guild-membership bump from the existing settlement
poll drives the refetch), so a browser-level `Cache-Control: max-age`
telling it to skip requests for a window is redundant with logic the
store already owns, and risks actively fighting it (the browser serving a
locally-stale response after the SPA's own state already knows to
refetch). Not adopting HTTP-cache timers — what actually needs caching is
the **expensive computation itself**, server-side, independent of how the
client's HTTP layer behaves:

- **What's cached.** Two tiers per chunk, both keyed by
  `(chunkCoord, sourceSetVersion)`:
  1. The per-player raw distance buffer (Option B, §1a) — pre-merge, the
     output of the BFS over that chunk's (bounds + source-halo) sources.
  2. The guild-facing merged-and-ramped **PNG bytes** — the max-merge of
     its members' buffers, ramped, encoded. This is what the endpoint
     actually serves.
- **Where.** Server-side `IMemoryCache` (or equivalent) in
  `FogMaskService`/`FogChunkService`, not a response-header instruction to
  the browser. A request that hits both cache tiers costs a dictionary
  lookup and a byte-array response — no BFS, no merge, no PNG encode.
- **Invalidation.** A settlement change bumps that *player's* buffer
  version for the handful of chunks its (radius + halo) touches (the
  source-halo query in §3's Mechanics, above)
  — nothing else recomputes. A guild-mask cache entry for an affected
  chunk is invalidated lazily (recomputed from the still-cached per-player
  buffers on next request) rather than eagerly pushed, so a settlement
  change that nobody immediately looks at costs nothing until it's asked
  for.
- **Eviction.** Still needs an explicit policy — the number of
  `(guildId-or-playerId × chunk)` entries grows with active guilds and
  world size and is otherwise unbounded on a long-running server. Sliding
  expiration (evict an entry after N minutes unused) plus a total size
  cap is the standard shape; exact numbers are a Phase 2 tuning question,
  but the policy must exist from the first implementation.
- **`ETag` stays**, but purely as a conditional-GET optimization for
  requests the SPA has already decided to make (§1d) — it avoids
  re-transferring unchanged bytes, it does not decide *whether* to ask.
- **World reseed.** `POST /api/v1/worlds/{id}/reseed` (admin-only,
  `AdminWorldEndpoints.cs`) can change a world's `Radius`, which changes
  the texel bounding box and therefore the chunk grid's own shape —
  `chunkCoord (3, 7)` can mean something different after a reseed than
  before. This is an admin tool, used rarely and deliberately, so the
  fix doesn't need per-key versioning: **reseed clears every cached
  entry for that world wholesale** — all chunk buffers, all per-player
  buffers, all guild composites, keyed simply by `worldId`. Simpler than
  threading a world-generation counter through every cache key (D1 candidate
  in the external review), and correct because reseed is rare enough that
  a full cold-cache refill afterward is a non-issue.

### The seam problem, and why it doesn't reach the shader

Fog v2's shader design (§2.4) relies on hardware
bilinear filtering across **one** texture. Naively sampling multiple
independently-fetched chunk textures in the shader would reintroduce
exactly the seam-filtering problem the doubled-row layout was designed to
avoid, plus classic tile-atlas bleeding at chunk edges.

Fix: chunking is a **network/cache-granularity** concept only, not a
GPU-sampling one. As chunks arrive, the client stitches them into one
contiguous `RenderTexture`/canvas covering the current viewport + margin —
the same "assembled virtual texture" pattern any tile-based map client
uses — and the shader keeps sampling that single assembled texture exactly
as designed. Each chunk carries a small (1–2 texel) overlap border when
stitched, so bilinear sampling right at a chunk boundary doesn't bleed
into unfetched territory.

### Sequencing — dynamic chunking, not a deferred 1×1 shortcut

Both ends implement real multi-chunk support in Phase 1–4, not a
single-chunk special case with multi-chunk added later. A "ship 1×1 now,
generalize later" shortcut means the N-chunk path (fetch batching, client
stitching, per-chunk cache/invalidation, the source halo) stays
unexercised until someone raises the world radius — exactly the kind of
path that's untested when it's finally needed.

**Pick chunk size independent of default world size**, small enough that
the *default* world (radius 60) already spans multiple chunks — e.g. a
fixed 32×32-texel chunk against the default world's ~121×242 texel
bounding box (§2.1's doubled-row convention) lands around 4×8 chunks, not 1.
That means the multi-chunk fetch/stitch/merge/cache path is the one and
only path exercised from Phase 1 on, by every world, by default — there
is no separate "big world" mode to forget to test. World-radius growth
later just changes how many chunks exist, not which code path runs.

## 4. Layer stack — resolves the `fogWorld` hack

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
without transform-syncing to anything. **Correction from an external
review:** the first version of this diagram put `tiles`/`borders`/
`buildings` as direct `app.stage` children — that's wrong, and would have
reintroduced the exact per-frame transform-sync hack this section claims
to delete, times three (`fogWorld` needed one `copyFrom` sync per frame
because it was a second world-space container living outside `world`;
three separate world-space stage children would need three). Tiles,
borders and buildings stay **nested inside the single `world` container**
so they keep moving/scaling together for free via `world`'s one
transform — §5 splits them into independently-invalidated *children of
`world`*, not into siblings of it. Only the two genuinely screen-space fog
quads are new `app.stage` children:

```
app.stage:
  world               (unchanged as a container — camera-transformed as one)
    tiles               (terrainBase, unchanged)
    borders             (borderLayer, now independently invalidated — §5)
    buildings/toppings  (terrainTop, already exists today, unchanged)
  blackFogLayer       (new, screen-space — out-of-sight tint)
  markerLayer         (names, troops, waypoints — unchanged)
  whiteMistLayer      (new, screen-space — never-scouted mist)
```

This still gives the same real gameplay property for free: troops/
waypoints/names render *through* the dark "explored but out of sight"
tint (arguably correct — you remember the terrain, you don't currently
see units on it, so showing stale unit markers there would be wrong
anyway) but stay hidden under white mist, which is exactly "never been
there → nothing to show." No `fogWorld`, no per-frame `copyFrom` sync
for fog, no ordering hack — delete that whole subsystem when the two
mask layers land. `world`'s own single transform sync (already how the
renderer works today) is untouched and unaffected by any of this.

## 5. Extracting `borders` from `world`'s per-camera rebuild — adopted, narrower than first stated

**Correction from an external review:** the original framing of this
section ("split `world` into tiles/borders/buildings, buildings
undifferentiated from tiles today") was factually wrong. Checked against
`HexMapRenderer.ts:1258-1268` — the actual `world.addChild` call is:

```
terrainBase.container, waveLayer, terrainFlat, borderLayer, hoverLayer,
terrainTop.container, highlightLayer
```

`terrainTop` **is** the buildings/props layer, and it's already separate
from `terrainBase` (the ground tiles) today — deliberately ordered above
`borderLayer`, per the module comment at `HexMapRenderer.ts:28-33`: a
realm border needs to tuck under a building's canopy, not slice across
it. So "split tiles/borders/buildings apart" is not three new containers
— buildings are already their own layer, correctly ordered. **The actual
work is narrower: give `borderLayer` its own invalidation cadence**,
decoupled from the camera-driven `rebuildAll()` pass everything else in
`world` still uses. `waveLayer`, `terrainFlat`, `hoverLayer` and
`highlightLayer` — four more real layers with their own ordering
constraints inside `world` — are untouched by this and stay exactly
where they are; they were dropped from the earlier version of this
section's diagram, which is fixed above in §4.

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

**Only `borders` changes.** Realm-influence polygons change whenever
settlement level/ownership changes — i.e. on the *same* trigger that
invalidates the fog mask. Since border extent today is computed from the
same `borderRadius(settlement)` distance math the fog generator now owns
server-side, **border geometry is a natural sibling to precompute on the
backend alongside the fog mask** — either as a second small texture/mask
or as vector polygons returned with the same version/ETag. Not required
for fog v2, but flagged here because the invalidation trigger is
identical and doing it later means re-deriving the same distance-transform
logic a second time.

Extracting `borders` into its own child container (still inside `world`
— §4) means a settlement level-up no longer forces re-touching
`terrainBase`/`terrainTop`/the other four layers listed above, and vice
versa — camera movement no longer forces re-touching borders either. This
is a `HexMapRenderer.ts` refactor independent of the fog mask work;
sequence it either just before or just after Phase 4 (shader layer),
since fog v2 already touches paint order in `mount()`.

**Still an open gap, not yet resolved here:** knowing *which* border
needs redrawing without walking the whole viewport still requires
per-hex, per-owner tracking somewhere — either a whole-world border
`Graphics` (unbounded at large `Radius`, per §3's chunk-count arithmetic)
or a per-settlement cached border geometry/texture keyed on
`(settlementId, level, ownership)`, composited by transform, mirroring
how the fog mask itself is cached per source. The backend-precompute
option two paragraphs up is the more likely shape of that answer, but
this doc doesn't pick one yet — flagged as an open item for whoever
picks up border decoupling, not a blocker for fog v2 itself.

## 6. Performance findings (write-down only — not scheduled)

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
  tiles (§5) and only rebuilt on actual ownership/level changes rather than
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

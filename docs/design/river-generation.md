# River generation

Design doc for the fourth and last of [issue #24](https://github.com/VanDooProject/bjarnoy/issues/24)'s
"generation rules" — the first three (coastal water, tile orientation, tile variants) shipped in
[PR #25](https://github.com/VanDooProject/bjarnoy/pull/25); this is the follow-up that adds rivers on top of
that branch. Agreed with the project owner before implementation; this doc is that agreement written down,
not a proposal.

The issue's own rules, restated as the constraints below satisfy them:

- rivers start on high elevation and funnel down to the coast
- rivers can merge via a Y tile, capped at two inflows, starting from a spring tile
- there is also a river bend tile
- rivers should not be shorter than 2 tiles
- river density should be limited — roughly one river per set of at least two mountain tiles

## Why this can't be a pure per-tile function

Terrain, coastal-water, orientation and variant (PR #25) are all pure functions of `(coord, seed)`: a hex
decides its own answer by sampling only its six neighbours, which is why the client can derive tiles it was
never sent — no map, no flood-fill. A river breaks that: whether a tile carries a river, which way it flows,
and whether it's a confluence all depend on the *whole path* from a spring to the coast, and on what other
rivers on the same island are doing. So river generation lives in `WorldGenerator.Generate()`, computed per
island right after the flood-fill — the same place `StartPositions` is already computed, for the same reason
(it needs the island's full tile set). It is **not** mirrored in the frontend's `worldGenerator.ts` in this
pass; wiring rivers through the tile API so the client can render them is deliberately left for a follow-up,
to keep this PR to the generation algorithm itself.

## Elevation

Reused, not reinvented: `TerrainSampler.IslandDepthAt(HexCoord)` already returns a `double?` — `0` at an
island's centre, `1` at its shoreline, `null` at open sea — and it's already what decides where mountains
form (`depth < MountainThreshold`). So "high elevation" is *low* depth and "funnel down to the coast" is
*increasing* depth along the path. Candidates for a river's next step are always restricted to land tiles of
the same island; a `null`-depth (sea) neighbour is never a step target — reaching a tile adjacent to one is
the stop condition instead (the river mouth).

## Spring placement (density rule) — lava islands only; green islands: see "Streams, springs, merging and late widening"

1. Within an island, flood-fill its mountain tiles into connected clusters (mountain-to-mountain adjacency
   only).
2. A cluster qualifies for a spring only if it has **at least 2 mountain tiles**; an isolated single mountain
   tile never spawns a river.
3. Every qualifying cluster gets **exactly one spring attempt** — deterministically, the mountain tile with
   the highest seed-hash score in that cluster.

This is the density rule: nothing caps rivers per *island*, only per *mountain cluster*. An island with five
separate qualifying clusters can end up with five rivers; "don't overload the island" falls out of mountain
geography, not an arbitrary global cap. Also not a hard guarantee — see below.

## Routing (funnel-to-coast + meander)

Strict steepest-descent on a smooth, roughly radial depth field produces near-straight radial lines, which
doesn't read as a river. Instead, at each step from the current tile:

1. Candidates are same-island land neighbours, not yet visited by *this* river, whose depth is **not less
   than** the current tile's depth (never step back toward the mountain — this alone guarantees the walk
   terminates and can't loop, since depth never decreases and the tile set is finite).
2. Score each candidate as `depth + meanderWeight * seedHash(candidate)` (a deterministic per-tile noise
   term) and take the top-scoring one, tie-broken by coordinate for reproducibility.
3. Stop *before* stepping onto a tile once the current tile is already adjacent to non-island sea — that
   tile is the river's mouth.
4. If a tile has zero qualifying candidates before ever reaching the coast (a local depth pocket from two
   islands' overlapping influence, in principle), the walk stops there instead of looping — a dead end, not
   a bug.
5. Once a step already has an inflow direction (i.e. it's not the spring's own first step), a candidate that
   would turn 120° off "continuing straight ahead" is excluded before scoring. The tile art pack's bend
   asset is a single fixed curve, camera-rotated six ways, and rotation alone can only ever depict a
   straight continuation or a 60°-off-straight curve — never a sharp 120° one, in either handedness. Letting
   the walk take a 120° turn would produce a `Bend` tile no orientation could render correctly, so it's ruled
   out at generation time rather than rendered wrong. This never excludes "continue straight" or the direction
   back toward the previous tile (already excluded by the visited-tiles check).

Scoring against noise instead of always taking the strict argmax is what produces meander: the path wobbles
between the (now up to) 2-3 non-decreasing, non-sharp-turn neighbours available at most steps while still
making steady net progress to the coast, and naturally produces a mix of bend and straight tiles instead of
"mostly straight."

## Length filter

After tracing, a spring's path is discarded outright if it came out shorter than 2 tiles (dead end, or a
cluster already right at the coast). That cluster's one attempt is spent — no second attempt with a
different mountain tile in this pass.

## Collisions: merge two, drop the third — never reroute (lava islands only)

Each spring routes **independently**, with no awareness of other rivers' claimed tiles while walking — two
springs that happen to pass near each other without ever sharing a tile just render as two separate nearby
rivers, which is fine. Only *after* every spring has traced its full path is collision resolution applied,
processing paths in a deterministic priority order (by spring coordinate) and walking each one tile by tile:

- The first two paths to reach a given tile share it: that tile becomes a confluence (2 inflows, the Y
  asset), and **only the higher-priority path continues past it** — the lower-priority path's line ends at
  the confluence tile; it has "become" the surviving river from that point on, so nothing renders two
  diverging outflows from one Y tile.
- A third path reaching an already-full (2-inflow) tile stops there instead — its portion past that point is
  dropped, not just that one tile.
- If a path's surviving (possibly truncated-by-confluence) portion ends up shorter than 2 tiles as a result,
  it is dropped entirely, the same as a naturally-too-short river.

Deliberately not attempted: rerouting a path around a soon-to-collide tile to keep it independent. Two rivers
that are merely close but never share a tile stay separate on their own; forcing an artificial detour to avoid
a real convergence would read as two rivers running suspiciously parallel, which looks worse than an
occasional honest merge.

## Tile shape and orientation

Each surviving river tile's shape is derived from how many inflow directions it has and whether it has an
outflow, all expressed as the `TileOrientation` values from PR #25 (so this plugs directly into that PR's
`OrientationAt(coord, override)` hook):

| Inflows | Outflow | Shape | Notes |
|---|---|---|---|
| 0 | yes | Spring | the source tile of a path |
| 1 | no | Mouth | last tile before the coast |
| 1 | yes, opposite direction | Straight | flows through in one line |
| 1 | yes, any other direction | Bend | the direction change is what makes it a bend |
| 2 | yes | Confluence | the Y tile; the two inflow directions are the two rivers merging |

### Art pack orientation convention

The frontend picks one of the tile art pack's six `TileOrientation` files (`rivertile_{shape}_{E,NE,NW,W,SW,SE}_base.png`/`top`) per river tile (`riverOrientationOf` in `textures.ts`). Each file is the *same* physical asset, camera-rotated by 60° increments — not six independently-drawn pieces — but the filename index does **not** correspond to the screen edge of the same name. This was missed in an earlier pass at this doc (pixel-sampled the art in isolation, without checking the placement math), which produced a `bendOrientationOf` that still rendered every bend disconnected from its neighbours in the real client — caught only by comparing an actual in-game screenshot against what the fix was supposed to look like, not by any test. The corrected derivation below was pixel-sampled *against* `isoTopPoints`/`isoGridPosition` (`lib/hex/geometry.ts`) — the exact placement math `HexMapRenderer` uses — rather than against the art in isolation, and cross-checked by compositing real tiles end-to-end at their true relative screen positions before touching any code.

**The projection reflects.** `isoTopPoints(w, h)` returns six vertices in a fixed order; label the edge between vertex `i` and vertex `i+1` as polygon edge `i` (0..5). Computing `isoGridPosition`'s screen delta between a hex and each of its six axial neighbours (`neighbors()`'s direction order — `E`=0, `NE`=1, `NW`=2, `W`=3, `SW`=4, `SE`=5, matching `TILE_ORIENTATIONS`) and matching each delta's direction against the polygon's own edge-midpoint directions gives, for direction index `d`, its shared screen edge:

```
edge(d) = (3 - d) mod 6
```

Not `edge(d) = d`. E.g. direction `E` (0) shares polygon edge 3, not edge 0 — the isometric camera reflects the direction wheel across the projection, it doesn't just relabel it in place.

Pixel-sampling every `rivertile_*_base.png` against that corrected edge mapping (`is_blue` sampling along each of the six polygon edges, inset slightly toward the hex centre to avoid anti-aliasing) gives each family's *actual* rotation convention, expressed as which polygon edges filename index `D` touches:

- **Bend** and **Spring** share one convention: file `D` touches the edges *adjacent to* its own index, `D-1` and `D+1` (mod 6) — never edge `D` itself. `Spring`'s pond only has one outflow, so it touches just one of the two (`D-1`).
- **Straight**: file `D` touches `D+1` and `D+4` (mod 6) — an opposite pair, one edge-step rotated from the bend/spring convention. `Mouth` has no art of its own and can render with either this family or `Bend` — see below.

Converting touched edges back to directions via `edge(d)`'s own formula (it's self-inverse: `edge(edge(d)) = d`) gives, for each family, the set of directions a file numbered `D` actually renders:

- **Bend**/**Spring**: `{ (2-D) mod 6, (4-D) mod 6 }` (spring only ever needs the first).
- **Straight**: `{ (2-D) mod 6, (5-D) mod 6 }` — also an opposite pair, and note `D` and `D+3` always touch the *same* set (opposite-pair symmetry), so either end of a straight tile's flow can be solved the same way and still land on a valid (if not necessarily identical) file.

Solving each for the `D` a tile's actual direction(s) need:

- **Bend**: the tile's `(inDirections[0], outDirection)` pair is always 2 orientation-indices apart (see "Routing" above). Let `anchor` be whichever of the two the other is `+2` from (order-independent — the *pair* determines `anchor`, not which one is in vs out). The file to use is `D = (2 - anchor) mod 6`. See `bendOrientationOf` in `types.ts`.
- **Spring**: `D = (4 - outIndex) mod 6`. See `springOrientationOf`.
- **Straight**: `D = (2 - index) mod 6`, using whichever of `inDirections[0]`/`outDirection` is available (either gives a valid file for the same pair). See `straightOrientationOf`.
- **Mouth**: has no `outDirection` (it's the end of the walk) but still needs to flow visibly toward the sea, and the generator's stop condition (`RiverGenerator.TracePath` breaks as soon as *any* neighbour is sea, regardless of angle) doesn't guarantee the sea sits opposite the inflow the way `Straight` assumes. A `RiverTile` carries no terrain, so the frontend looks the sea neighbour up itself — `WorldModel.seaFacingDirectionOf`, the first sea-terrain neighbour found, in `TILE_ORIENTATIONS` order — and `mouthOrientationOf` (`types.ts`) picks the family from the resulting angle: 3 apart (opposite) uses `Straight` via the rule above; 2 apart uses `Bend` via `bendOrientationOf(inDirection, seaDirection)`, the same as an ordinary mid-river turn; 1 apart (60°) now uses the `Bend60` hairpin family (`bend60OrientationOf`; before the stream PR it fell back to the inflow-opposite `Straight` file). (This was caught after the `Bend` fix shipped: a live screenshot showed a mouth tile visibly running into forest instead of the coast — island Jarlskar, seed `783131215`, tile `(-8,4)`, inflow `NE`, actual sea neighbour `SE` — a 60°, `Bend`-representable angle that the old inflow-opposite-only logic had no way to pick.)
- **Confluence** (`y_narrow`) — *superseded: the outflow edge below was corrected by the stream twins, see "Streams, springs, merging and late widening"; on an all-river tile the outflow cannot be measured*. Re-derived in a later pass, the same way as the other three. Pixel-sampling every `rivertile_y_narrow_*_base.png` found a consistent, rotation-stable pattern: file `D` touches a fixed opposite pair (edges `1+D` and `4+D`, a "trunk" running straight across the hex) plus a third edge (`5+D`, a "branch" joining the trunk right before it exits) — three touched edges, not a simple rotated pair or pair-adjacent-to-`D` the way Bend/Spring/Straight are. Converting through `edge(d) = (3-d) mod 6` gives `out = (5-D) mod 6` (the trunk's far, branch-adjacent end), `trunkIn = (2-D) mod 6`, `branchIn = (4-D) mod 6` — see `confluenceOrientationOf` in `types.ts`. Unlike an ordinary bend, a confluence's `(in1, in2, out)` angles aren't constrained to one fixed relative arrangement — two independently traced paths collide wherever they happen to (see "Collisions" above) — so most real confluences still don't match this one representable rotation; `confluenceOrientationOf` returns `null` for those, and `riverArtFor` falls back to the same untransformed `outDirection ?? inDirections[0]` as before, the same pattern `mouthOrientationOf` already uses for its own unrepresentable angle. Fully fixing every possible triple would still mean changing collision resolution itself, not just orientation selection.

"Opposite direction" means the inflow and outflow directions are 3 apart on the 6-direction wheel (`E`↔`W`,
`NE`↔`SW`, `NW`↔`SE`) — the geometric definition of "flows straight through this hex."

## Output shape

`GeneratedIsland` gains a `RiverTiles: IReadOnlyList<RiverTile>`, where

```csharp
public readonly record struct RiverTile(
    HexCoord Coord,
    RiverTileShape Shape,
    IReadOnlyList<TileOrientation> InDirections,
    TileOrientation? OutDirection);
```

Not wired through `GeneratedTile`/`TileResponse`/the frontend in this pass — see "why this can't be a pure
per-tile function" above. That wiring, plus the level-not-affecting-building-graphics bug and the missing
buildings from the rest of issue #24, are follow-ups.

## Mountain shapes and spring-capable art

VanDooProject/3D_assets PR #36 split the single mountain render into four shapes — Cone, Table, Saddleback,
Corrie (`MountainShape` in the backend, mirrored in `worldGenerator.ts`'s `VARIANT_COUNTS.mountain = 4`) — and
added a `_spring` art cut (`hextile046_..._saddleback_spring`, `hextile047_..._corrie_spring`) for only two of
them: Cone and Table have no spring graphic at all.

`TerrainSampler.MountainShapeAt(coord)` is just `VariantAt(coord)` typed as the enum — the tile art pack has
no base/top split for mountains, so this, like grass/forest variants, is a seed-stable pure function of the
coordinate alone, independent of rivers.

Whether a given mountain hex *is* a spring is a whole-island question (see "why this can't be a pure per-tile
function" above) — `RiverTile.Shape == Spring` at that coordinate. `TerrainSampler.SpringMountainShapeAt(coord)`
(mirrored as `springMountainShapeAt` in `worldGenerator.ts`) answers a *different*, deliberately pure question:
if this coordinate turns out to be a spring, which of the two spring-capable shapes should it render as —
regardless of what `MountainShapeAt` would otherwise have picked. This is the same pattern `FishingHutOrientation`
already uses: a pure answer fed to an external override hook, not state threaded through generation. The
renderer is expected to call it only once it already knows (via the `RiverTile`) that a coordinate is a spring,
and to use its result — not `MountainShapeAt`'s — for that one tile's mountain family.

This intentionally does **not** restrict which mountain a river's spring lands on (`RiverGenerator.PickSpring`
is unchanged): a spring always renders with a spring-capable shape, even where `MountainShapeAt` would have
picked Cone or Table for that coordinate.

Update: the atlas now vendors all four `mountaintile_{cone,table,saddleback,corrie}` families (cone is just the
plain, unqualified `mountaintile` family) plus the two spring cuts, and `textures.ts`'s river rendering points
`RiverArtShape.spring` at `mountaintile_corrie_spring` (fixing the flat placeholder it used to render with) —
but that's a fixed choice, not `SpringMountainShapeAt`-driven variety between Corrie and Saddleback, and
ordinary (non-spring) mountain tiles still all render the single generic `mountaintile` family regardless of
`MountainShapeAt`. Wiring `KEY_FAMILY`/river rendering to actually consume `MountainShapeAt`/
`SpringMountainShapeAt` per-coordinate, so mountains read as a mix of all four shapes the way the generation
side already supports, remains the follow-up.

## Streams, springs, merging and late widening

Everything below applies to green islands; lava (wasted) rivers keep the older rules described above (one
spring per mountain cluster, independent walks, drop-on-collision, river width) and every lava tile is
`RiverWidth.River`. `RiverGenerator.cs` and `riverGenerator.ts` are byte-identical ports; the golden fixture
`src/shared/river-generation-golden.json` covers the smallest island that keeps rivers, a confluence, a bend60,
a widening straight, a stream confluence (smallwide Y), a river confluence, a stream-into-river confluence, a
widening mouth and a lava stream.

### Data model

`RiverTile.Width`: `River` (0, what every stored tile before streams is), `Stream` (1: half width on every
edge), `Widen` (2: stream in, river out) and `RiverStream` (3: a confluence of one river and one stream
inflow, river out; wide-Y geometry only). Persisted as a sixth field of the `RiverTileListConverter` token
(older five-field rows parse as `River`), on the wire as `"width": "river" | "stream" | "widen" | "riverstream"`. A river
starts as a stream and widens once; what follows the widening tile is river.

### Drainage networks (green islands)

The first streams pass walked every spring down the island's radial depth field to its own nearest coast:
correct (no inland mouth, orientations verified) but tributaries hardly ever met a trunk (2 merges in 147
rivers, ~17 tiles long). Green islands now get a **drainage network** instead. Everything is in
`RiverGenerator.GenerateGreen` (`Drainage`, `TraceDrainage`, `SearchJunction`) and mirrored bit for bit in
`riverGenerator.ts`; all knobs are `WorldGenerationOptions` values (admin-tunable like the rest) and TS
constants of the same name.

1. **Outlets.** `Kout = clamp(round(landTiles / OutletTilesPer), 1, MaxOutlets)` (2000, 12). Candidates are
   coastal land tiles (touching sea) that have an interior neighbour to take flow from. Score = number of island
   tiles within hex radius 3 (bays score high, spits low) plus the `+59` hash. Farthest-point sampling: the
   first is the best score, each next maximises its distance to the outlets chosen (ties by score), stopping at
   `Kout` or when the best is closer than `MinOutletSpacing` (25).
2. **Drainage field.** Dijkstra from all outlets over **(tile, arrival direction) states** of the island's
   interior tiles (an interior tile does not touch the sea; only outlets are coastal, so a river never runs
   along the shore). Entering tile `N` costs `1 + DrainageNoise * hash(+53) + ValleyNoise * valueNoise(+61,
   wavelength ValleyScale) + MountainCost` (if a mountain): per-tile jitter plus a smooth valley field, so
   paths bend along coherent valleys instead of running ruler-straight, and go round ranges (`MountainCost`
   2) rather than across them. A turn costs `BendCost` (60 degrees, a Bend tile) or `SharpBendCost` (120
   degrees, Bend60); the 180 degree hairpin has no art and is not offered. The cheapest way on from a state is
   recomputed on demand by scanning the six outflows (`Drainage.BestOut`), which is exactly the value the
   Dijkstra stored, so no pointer array exists. The heap breaks ties on the state index, so both languages pop
   in the same order.
3. **Springs.** Candidates as before (range-edge mountain tiles of clusters of 2+, not touching the sea), now
   only those the field can drain. `K = clamp(round(landTiles / RiverTilesPerSpring), 1, MaxSpringsPerIsland)`
   (500, 24), farthest-point sampling with `MinSpringSpacing` 8; the first is the most inland candidate.
4. **Tracing and junctions.** Springs are processed longest drainage cost first (the longest becomes the
   trunk). A walk first runs `SearchJunction`: a Dijkstra over free interior tiles (turns priced, no hairpins)
   to an *approach* tile beside a plain one-inflow trunk tile, on a side its Y can be drawn from
   (`RiverConfluence.Classify`), priced as its own cost plus the trunk's remaining cost to its outlet. It joins
   when that total is at most the walk's own cost to an outlet plus `MergeSlack` (6) and the route itself costs
   at most `MergeReach` (20), so a tributary joins a nearby trunk unless that is much longer than running on
   alone. A junction into a river-width trunk (downstream of an earlier confluence) with the wide geometry
   gets `RiverStreamBonus` (3) off, because the river-stream Y needs no widening first.
   With no junction near, the walk follows the pointers. Before stepping beside an earlier river it searches
   again; when its next tile is an earlier river's it joins if the Y is drawable, else searches, else runs on
   alone (`SearchJunction` with `toMouth`: cheapest route to any free coastal tile, tiles beside earlier rivers
   cost `CrowdingCost` 2 each, reach `3 * MergeReach`) and becomes a river of its own with a new mouth; if even
   that fails it is dropped and counted (`DroppedRivers`).
5. Widths per "Width assignment" below.
6. **Mill space** is reported, not enforced: the preview statistics list the river-width Straight tiles (Crop
   Mill) per island with rivers (min and median), because the river buildings need River-width tiles.

A hex has exactly one way to draw a junction from each side, which is why a tributary on the "wrong" side of
a straight trunk cannot join it (no mirror of the narrow Y; the wide Y needs the trunk to bend 60 degrees):
the search looks along the trunk for a bend, and otherwise the tributary makes its own mouth.

Hash offsets used by the tracer on the island seed (`worldSeed + islandIndex * 104729`): `+41` spring
candidates, `+43` legacy meander, `+47` widening pick, `+53` per-tile drainage noise, `+59` outlet score, `+61`
valley noise.

Acceptance (`scripts/worldgen-preview/river-stats.ts --seeds 1-8 --radius 1000`, and
`RiverStreamTests`): 0 inland mouths, every confluence drawable, truncated + dropped under 5% of rivers, at
least one merge per island with 4+ rivers on average, hugging adjacencies under 3% of river tiles (river-width
Straight tiles per island are reported, not asserted).

### Width assignment

After tracing, the tiles form a forest flowing to the mouths. In topological order (springs first):

1. Every tile is a stream at first.
2. A confluence whose two inflows both arrive as streams is `Widen` (the smallwide Y); everything below is
   river.
3. A stream branch reaching a river branch at a confluence with the wide-Y geometry (inflows at `o+2` and
   `o+4`) needs no widening: the tile is `RiverStream`, drawn with `rivertile_riverstream_ywide` (see below).
   Otherwise (narrow geometry), and at a sea mouth, the branch that must arrive at river width **widens on a Straight tile**: with `L` the length of that stream run (spring to the
   tile before the requirement), one Straight tile with index `>= ceil(L/2)` (and `>= 1`, never the spring) is
   chosen uniformly by the `+47` hash of the requirement tile. Never in the first half. That tile is `Widen`,
   everything below it up to the requirement is river.
4. If the second half has no Straight tile: a mouth tile whose sea neighbour is opposite its inflow is itself
   the widening tile (smallwide straight with the river edge toward the sea); at a confluence the stream branch
   is **truncated** (dropped up to where it would join; the confluence carries on as a plain river tile); a
   mouth that cannot widen drops its whole river. `RiverStats` counts both; the tests assert < 5% of rivers.
5. A river-width mouth whose sea is straight ahead renders as `rivertile_delta` (below); other river mouths are
   as before.

The variant roll (`TerrainSampler.RiverVariantAt`) applies to stream tiles too (meander and loop families;
a stream has no gravel-bar island, so an `island` roll draws plain), and never to `Widen` tiles. The river
buildings (Sawmill, Crop Mill, and the planned Hammerschmiede) need **River**-width tiles: their art is river
width. `BuildingCatalogue` shape gating is unchanged, but `SettlementService.RiverShapeAtAsync` reports a
shape only for `River` tiles, and the frontend (`riverBuildingAllowedHere`, `riverBuildingArtFor`) does the same.

### Art conventions of the stream set

Pixel-measured exactly like the river families above (water width along each polygon edge of every `*_base`
frame, against `edge(d) = (3 - d) mod 6`; stream width is half the river's on the same edge):

| Family | File `D` touches | Ends |
|---|---|---|
| `rivertile_small_bend180` (+ `_meander`) | `D+1`, `D+4` | stream, same as `rivertile` (river) |
| `rivertile_small_bend120` (+ `_meander`) | `D-1`, `D+1` | same as `rivertile_bend` |
| `rivertile_small_bend60` (+ `_loop`) | `D`, `D+1` | same as `rivertile_bend60` |
| `rivertile_smallwide_bend180_island` | `D+1`, `D+4` | **stream at `D+1`**, river at `D+4` |
| `rivertile_smallwide_y_narrow` | `1+D`, `4+D`, `5+D` | **river at `1+D`**, streams at `4+D`, `5+D` |
| `rivertile_smallwide_ywide` | `1+D`, `3+D`, `5+D` | **river at `1+D`**, streams at `3+D`, `5+D` |
| `rivertile_delta` | `D+1`, `D+4` | river in at `D+1`, **sea at `D+4`** |
| `rivertile_riverstream_ywide` (**not yet in the atlas**) | `1+D`, `3+D`, `5+D` (the ywide edge set) | two river arms, one stream arm; symmetric, so the stream may join from either side |

So the stream families take the river families' orientation helpers unchanged. For the asymmetric ones the
file for a tile whose upstream flow arrives from direction `i` is `D = (2 - i) mod 6`
(`widenStraightOrientationOf`, `deltaOrientationOf`; the far end is the river / sea).

**The Y's outflow.** On an all-river Y tile every touched edge has the same width, so an earlier pass could
not tell which edge is the outflow and assumed the narrow Y's outflow was edge `4+D`. The stream twins settle
it: the river edge is `1+D`, i.e. outflow `o = (2 - D) mod 6`, the two tributaries at `o+2` and `o+3` (narrow:
60 degrees apart, "two tributaries running nearly parallel", matching the asset docs' `E`, `SE` streams and `W`
river) or at `o+2` and `o+4` (wide: 120 degrees each way). `confluenceOrientationOf` /
`confluenceWideOrientationOf` now use that for the river Y as well, so both widths share one predicate
(`confluenceKind`, C# `RiverConfluence.Classify`), checked on both sides against
`src/shared/confluence-representability.json` (12 of the 90 `(out, inflow pair)` rows are drawable; the mirror
image of the narrow Y has no art).

**Mouths** now also render the hairpin: a sea neighbour adjacent to the inflow direction uses `bend60` (the
old "1 apart falls back to straight" note above is obsolete). `mouthSeaDirection` picks among several sea
neighbours the one straight ahead, then a 60-degree turn, then the hairpin, which is the same "sea opposite the
inflow" test the generator uses when it lets a stream reach a mouth.

**Stream into river: `rivertile_smallwide_bend120_tributary`** (bg_assets_hextile `edba233`). The `ywide` geometry
with two river arms and one stream arm: a stream joins a river from either side, the river bending 60 degrees at
the junction (river at `s+2` and `s+4` for a stream arriving from `s`). The generator produces it as
`RiverWidth.RiverStream` (wire `"riverstream"`, classified by `RiverConfluence.Classify(inA, aIsRiver, inB,
bIsRiver, out)` as `RiverStreamWide`) and stores the **stream inflow first** in `InDirections`, so the renderer
knows which arm is the stream. Pixel-measured against `isoTopPoints`: file D carries the stream on polygon edge
`D+3` and the river on `D+1`/`D+5`, so with `edge(d) = (3-d) mod 6` the file for a stream arriving from `s` is
`D = (6 - s) mod 6` (`tributaryOrientationOf`, tested for all six directions in `types.test.ts`).

The spring art (`mountaintile_corrie_spring`, `_saddleback_spring`) hands over at stream width already.

### Mountain ranges and forest patches (terrain)

At island scale, single-hex rockiness noise gave salt-and-pepper mountains. `TerrainAt`/`terrainAt` now make a
hex mountain when its depth is under `MountainThreshold` and `MountainField` beats `MountainRockiness`
(unchanged knob, default 0.72): a ridged (`1 - |2n - 1|`) coarse value noise (wavelength 10, seed `+5`) so the
crests are long winding lines, blended 88/12 with a fine wavelength-2.5 term (`+7`) so a range's edge is not a
smooth blob. Forest versus grass uses the old `+2` noise at wavelength 6 (patches of a few to tens of hexes).
Wasted terrain is unchanged.

## Bigger islands, more rivers

Rivers only exist on islands with a qualifying (2+ tile) mountain cluster (see "Spring placement" above; green islands now place several springs per island, see the streams section), so
bigger islands mean more inland area for mountains, and therefore more islands with rivers, without any change
to the river algorithm itself. Islands have grown twice: the original circles (2.4-5.6 hexes) were doubled,
then reshaped; with island shape v3 (below) a typical island is ~150 hexes across (5k-15k tiles), so nearly
every island of the default world has several rivers. The default `WorldGenerationOptions.Radius` is 4000
(raised from 90; it may be raised to 5000, see `WorldGenerationOptions.MaxRadius`).

## Island shape v3: spine, width and fractal coast

Every island is a *bent spine of vertices with a width each* plus a few satellite islets, measured against a
warped, noisy distance field. `TerrainSampler.IslandShapeAt` builds a cell's shape (cached per cell),
`TerrainSampler.IslandDepthAt`/`WastedDepthAt` measure a hex against the islands around it, and
`worldGenerator.ts` mirrors both bit for bit (`islandShapeAt`, `closestIsland`). Only `+ - * /`,
`Math.Sqrt`, `Math.Floor` and comparisons are used - no `Math.Hypot`, trigonometry or `pow` - in a fixed
evaluation order, so .NET and JS agree on every double; `src/shared/island-shape-golden.json` (generated by
`scripts/regen-goldens/island-shape-golden.ts` from the TypeScript) is asserted exactly by
`IslandShapeGoldenTests` and `islandShape.golden.test.ts`.

Islands sit on a grid of `IslandCellSize` cells (default 260) in odd-q offset space. Per cell, all seed-hashed
off the cell's own coordinates:

1. **Presence**: `hash < IslandChance` (default 0.8).
2. **Size class**: A (small, `hash < IslandSmallShare` = 0.3), C (large, `hash > 1 - IslandLargeShare` = 0.12)
   or B. Widths scale by 0.55 / 1 / 1.6. Roughly: B ~150 hexes across (5k-15k tiles), A ~80 (1.5k-7k), C ~250
   (15k-40k). A large island clears the eight cells around it; of two neighbouring large ones the higher
   `+307` roll wins and the loser is demoted to B. (Evaluated exactly like the frontend: a large cell demoted
   by one large neighbour and then meeting another is suppressed, which is a quirk kept for parity.)
3. **Centre**: the cell centre plus a jitter of +-0.275 cells (`+11`, `+13`).
4. **Width** `IslandMinWidth..IslandMaxWidth` (21-40) times the class scale; **segment count**
   `IslandMinSegments..IslandMaxSegments` (5-9); **elongation** `IslandMinElongation..IslandMaxElongation`
   (5-8 half-widths of total spine length).
5. **Spine**: a random direction, then per step a rotation by `tan(half angle)` `t` (rational rotation
   `((1-t^2)/(1+t^2), 2t/(1+t^2))`, no trig): the island's bend `IslandMinBend..IslandMaxBend` (0.12-0.35,
   random sign) times a per-step wobble `0.5..1.5`. Crescents and Cs come from the bend; the spine is centred
   on the island centre. Per-vertex width is the tapered width (tips `1 - 0.5 f^2`) times a `0.6..1` jitter.
6. **Islets**: up to 5 discs, 0.3-0.7 of a vertex's width in radius, 1.6-3.2 widths off a random vertex.
7. **Reach clamp**: the farthest land can get from the centre (`spine offset + width * noise factor`, islets
   included) must fit the 3x3 cell block every hex scans, `(1.5 - 0.55/2) * cellSize - warps`; a bigger island
   is scaled down uniformly (never cut). `IslandShape.ClampFactor` records it.
8. **World edge**: if the hex distance of the rounded centre plus `1.42 * (reach + warps)` exceeds the world
   radius the cell holds **no island**. An island is never clipped by the edge; it is not generated. This makes
   the pure terrain function depend on the world radius, which is why the radius travels with the generation
   constants (`WorldGenerationResponse.WorldRadius`).

A hex first gets a **two-octave domain warp** (amplitude `IslandCoastWarp` = 9.5 / wavelength
`IslandCoastWarpScale` = 42, plus a fixed 3.8 / 11.4 octave) for fjords, bays and headlands, then its depth into
each island in reach is the minimum over spine segments of `distance / interpolated width` (islets:
`distance / radius`), plus **three octaves of shoreline noise** (`IslandCoastNoise` = 1.0 at wavelength
`IslandCoastNoiseScale` = 49, then 0.7x at /2.5 and 0.45x at /6.25). Land is depth <= 1; the beach is
`BeachThreshold` (0.9), mountains need depth < `MountainThreshold` and rockiness above `MountainRockiness`
(unchanged rules). Wasted islands use the same shape under their own seed offset (`+1000003`), with
`IslandChance * 0.1` and never on a green island's cell.

### Cell-based generation

`WorldGenerator.Generate` never samples the sea. It enumerates the cells whose island survives the edge rule,
scans each island's tight land-possible box at stride 2 (even column, even row) for land, and flood-fills every
landmass it finds once (a global visited set, so touching islands are one landmass). Landmasses are ordered by
their lowest (Q, R) tile for stable island indices; those under `MinimumIslandTiles` are dropped; rivers, giants
and start positions are computed per island in parallel (results land in per-island slots, so ordering is
deterministic). Reference timings on a 4-core sandbox (seed 11): radius 1000 ~2 s (32 islands, 150k land hexes),
radius 4000 ~45 s (762 landmasses, 2.75M land hexes). Only a landmass narrower than the stride in both
directions could slip between scan samples; `IslandGenerationTests` compares the result with a brute-force scan
of every hex.

### Guardrails in `WorldGenerationOptions.Validate()`

Range checks on every knob (cell size 16-4096, chance in (0, 1], width 2-200, segments 1-24, elongation 0-20,
bend 0-1, warp 0-60 / scale 2-400, noise 0-3 / scale 2-400, shares >= 0 and summing to at most 1, radius
1-5000, each min <= max), plus:

- **Warp fold-safety**: `1.5 * (warp / warpScale + warp2 / warpScale2) < 1`, covering both warp octaves -
  otherwise the warp could fold the sample space onto itself and detach slivers of land.
- **Room for the warps**: the reach budget `(1.5 - 0.275) * cellSize - (warp + warp2)` must be positive.

There is no reach-budget rejection any more: the clamp shrinks a too-big island instead.

### Admin-tunable

`IslandCellSize`, `IslandChance`, `IslandMin/MaxWidth`, `IslandMin/MaxSegments`, `IslandMin/MaxElongation`,
`IslandMin/MaxBend`, `IslandCoastWarp`/`Scale`, `IslandCoastNoise`/`Scale`, `IslandSmallShare`,
`IslandLargeShare`, plus the beach/mountain thresholds and rockiness, are persisted per world (`WorldEntity`
columns), sent to the client in `WorldGenerationResponse` and overridable in the admin reseed form and lab.
Everything else (taper, width scales, second warp octave, octave weights, islet parameters, class scales,
jitter 0.55) is a code constant mirrored on both sides (`IslandShapeConstants` / `ISLAND_SHAPE`).
`WorldGenerationOptions.Compact` (and `COMPACT_GENERATION` in TS) is the same shape at test/dev scale.

### Hash-offset registry

Every random draw hashes `(cellCol, cellRow, seed + offset)`; a fixed offset picks an independent noise stream.
Two draws sharing an offset would correlate, so add new ones from the unused numbers. In use (`seed` is the
world seed, or `seed + 1000003` for wasted islands):

| Offset | Purpose |
|---|---|
| `+0` (bare `seed`) | whether a cell holds an island (`IslandChance`) |
| `+11`, `+13` | island centre jitter, column / row |
| `+17` | island width |
| `+19` | segment count |
| `+23`, `+47` | spine start direction x / y |
| `+53`, `+71` | coarse coast warp, column / row axis (`ValueNoise.Sample`) |
| `+59` | spine bend (sign and size) |
| `+61` | spine elongation |
| `+83`, `+89` | fine coast warp, column / row axis (`ValueNoise.Sample`) |
| `+97`, `+101`, `+103` | shoreline noise octaves 1-3 (`ValueNoise.Sample`) |
| `+200 + k` (`k` = 0..23) | per-vertex width jitter |
| `+300` | islet count |
| `+301` | size class (A/B/C) |
| `+307` | tie-break between neighbouring large islands |
| `+310 + i` .. `+350 + i` (`i` = 0..4) | islet vertex, direction x / y (`+320`, `+330`), distance (`+340`), radius (`+350`) |
| `+400 + k` (`k` = 1..23) | per-step bend wobble |

Other per-hex properties keep their own offsets (`+2` rockiness, `+29` orientation, `+31` variant, `+37`
spring shape, `+41` soil, `+67` river variant); `+201`..`+223` and `+400`.. overlap none of them because those
draws use the hex coordinates, not the cell's. A new cell-hashed parameter should avoid `200-223`, `300-359`
and `400-423`.

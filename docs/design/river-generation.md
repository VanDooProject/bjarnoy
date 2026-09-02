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

## Spring placement (density rule)

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

## Collisions: merge two, drop the third — never reroute

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
- **Mouth**: has no `outDirection` (it's the end of the walk) but still needs to flow visibly toward the sea, and the generator's stop condition (`RiverGenerator.TracePath` breaks as soon as *any* neighbour is sea, regardless of angle) doesn't guarantee the sea sits opposite the inflow the way `Straight` assumes. A `RiverTile` carries no terrain, so the frontend looks the sea neighbour up itself — `WorldModel.seaFacingDirectionOf`, the first sea-terrain neighbour found, in `TILE_ORIENTATIONS` order — and `mouthOrientationOf` (`types.ts`) picks the family from the resulting angle: 3 apart (opposite) uses `Straight` via the rule above; 2 apart uses `Bend` via `bendOrientationOf(inDirection, seaDirection)`, the same as an ordinary mid-river turn; 1 apart (120°) is unrepresentable by either family — nothing on the generation side prevents this angle the way the ordinary-bend 120°-turn exclusion does, since the sea isn't a tile in the walk — and falls back to the inflow-opposite `Straight` file as a documented best-effort. (This was caught after the `Bend` fix shipped: a live screenshot showed a mouth tile visibly running into forest instead of the coast — island Jarlskar, seed `783131215`, tile `(-8,4)`, inflow `NE`, actual sea neighbour `SE` — a 60°, `Bend`-representable angle that the old inflow-opposite-only logic had no way to pick.)
- **Confluence** (`y_narrow`): **not** re-derived by this pass — its asset has three touched edges (a fixed opposite pair plus a third at a fixed offset from filename index `D`), not a simple rotated pair or pair-adjacent-to-`D`, and hasn't been pixel-verified against the corrected edge mapping. `riverArtFor` (`textures.ts`) still uses the untransformed `outDirection ?? inDirections[0]` for it — known-unrenderable in general (see "Collisions" above: confluences come from independent paths colliding, so fixing this would mean changing collision resolution, not just orientation selection), and now additionally unverified rather than pixel-checked-and-still-wrong.

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

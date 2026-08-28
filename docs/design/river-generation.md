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
- rivers should not be shorter than 3 tiles
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

Scoring against noise instead of always taking the strict argmax is what produces meander: the path wobbles
between the 2-3 non-decreasing neighbours available at most steps while still making steady net progress to
the coast, and naturally produces a mix of bend and straight tiles instead of "mostly straight."

## Length filter

After tracing, a spring's path is discarded outright if it came out shorter than 3 tiles (dead end, or a
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
- If a path's surviving (possibly truncated-by-confluence) portion ends up shorter than 3 tiles as a result,
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

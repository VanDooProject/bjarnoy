# worldgen-preview

Renders a world from the **real** client generator
(`src/frontend/src/lib/map/worldGenerator.ts`, imported as-is through `tsx`; nothing is
copied) to a PNG: true flat-top hex geometry, the world radius outlined, a legend strip and
a stats footer.

```bash
cd src/frontend
npm ci                      # once (installs tsx)
npm run worldgen-preview -- --seed 11 --radius 1000 --out preview.png
```

`--out` is relative to the directory you ran `npm` from. A whole radius-1000 world takes
about 8 s; a radius-4000 world (the default) takes about a minute, mostly the landmass scan: add `--no-stats` to skip it.

| option | meaning |
| --- | --- |
| `--seed N` | world seed (default 1) |
| `--radius N` | world radius in hexes (default 4000). It is part of the terrain: an island that could cross it is not generated |
| `--window Q,R,SIZE` | draw only `SIZE` hexes across, centred on axial hex `(Q,R)` (default: the whole world) |
| `--px N` | pixels per hex circumradius; default fits the map to ~1800 px wide (below 1 px a hex is sampled at its centre) |
| `--layers a,b` | layers, drawn in order: `terrain` (default), `wasted`, `rivers`, `bog`, `camps` |
| `--set k=v,...` | override generation constants, e.g. `islandChance=0.5,islandCellSize=200` |
| `--no-legend`, `--no-stats` | drop the legend strip / skip the landmass scan |

The footer prints the island count, the size distribution (`<100 ... >40K` tiles), the number
of A/B/C island cells and timings (terrain sampling, landmass scan). Islands are found the way
the backend's `WorldGenerator` does, so the counts agree with it.

## The `rivers` layer

`--layers terrain,rivers` traces every green island's rivers with the real generator
(`riverGenerator.ts`, the byte-identical twin of the backend's) over the landmasses found and indexed the way
`WorldGenerator` does. Streams are thin and light blue, rivers thick and dark blue, the tile where a stream
widens a yellow dot, springs white dots, confluences magenta rings, mouths orange rings (with hexes under
3 px the marks fill the whole hex instead). Footer lines: rivers, springs and tiles per island,
merges, widenings, truncated branches, dropped rivers, **inland mouths (must be 0)** and the parallel-run
metric (adjacent tiles of rivers that drain to different mouths). A `--window` only traces islands it touches.

`npx tsx ../../scripts/worldgen-preview/river-stats.ts --seeds 1-8 --radius 1000` (from `src/frontend`) prints the river
acceptance statistics over several seeds: rivers, outlets and merges per island (with a merge histogram), spring-to-mouth
lengths, river/widen/stream tile shares, river-width Straight tiles per island, truncated and dropped branches, inland
mouths and parallel runs. `--islands` also dumps the per-island numbers as JSON.

## Adding a layer

A layer is an entry in `LAYERS` in `layers.ts`: an id, a description, its legend entries and a
`colourAt(q, r, world)` that returns a colour (or `null` to keep what the layers below drew).
The legend strip is generated from the layers' own colour tables, so the picture and its
legend cannot drift. A layer may also declare `prepare(world, window)` (a whole-world pass; returns extra stats lines) and `subhex` (colours per pixel inside a hex, for lines and marks), draw markers over the finished map (`overlay`, used by `camps`: a marker per family, a ring at the guard range, magenta strong / cyan weak) and add footer lines (`stats`).

The `camps` layer runs the client ports of the backend pipeline (rivers, giants, camps) island by island in the backend's own island order, so it shows what a server world holds; with `--window` only the islands in view are generated. Its footer gives camps per island (min/median/max), per family and strong/weak.

## The `bog` layer

`--layers terrain,rivers,bog` shows the bogland the real generator places (`bogGenerator.ts`, called inside the river
pipeline): bog moss (olive), lakes (dark slate blue), shores tinted by how many lake edges they touch (inlet, shore, half:
one, two, three), creeks (light blue lines), lake mouths (orange rings) and creek springs (white dots). Under 3 px a hex is
one colour. The footer prints the bog islands, lake sizes (min/median/max), through-river bogs, sinks and spawns (with
their share of the bogs: together under 20%), the enclosed sea pockets found and filled, and one **rule-violation count
per map rule R1-R11 (must all be 0)**, checked by `bogRules.ts` (the twin of the backend's `BogRules`). The rivers layer
follows a river through a lake, so its `inland mouths` count stays 0.

`npx tsx ../../scripts/worldgen-preview/bog-stats.ts --seeds 1-8 --radius 1000` (from `src/frontend`) prints the bog
acceptance statistics over several seeds: bogs and lakes per island, lake sizes, through-river bogs, sinks/spawns shares,
pockets, and the violations per rule.

## The pathing preview

Checks the owner's decided movement and palisade rules on example renders **before** anything changes in the game. A sibling
script (the layer needs a scenario, not just a seed) that reuses the preview renderer:

```bash
cd src/frontend
npm run worldgen-pathing -- ../../scripts/worldgen-preview/scenarios/c-sea-end-seals.json --out c.png
npm run worldgen-pathing -- --all --out-dir /tmp/pathing        # every scenario, pathing-<name>.png
npx tsx ../../scripts/worldgen-preview/pathing-stats.ts --seeds 1-8 --radius 1000    # whole-world statistics
```

It draws, for a seed and a `--window`-style window of the real generator's world:

- terrain, with **mountains hatched** (impassable), **wide rivers** thick and dark blue (impassable), **streams** thin and light
  blue (crossable at +8), bog and lake from the bog generator, and a faint hex grid so adjacency can be counted;
- every **palisade hex as the real centreline of its piece**, in the rotation `src/frontend/src/lib/map/palisadeTiles.ts`
  picks (the art contract's: a straight edge to edge, `bend60` an arc of r 0.5 round the shared corner, `bend120` an arc of
  r 1.5 round the far corner, an end running 0.46 past the centre to a lookout square, the sea end dashed). A wrong rotation
  shows as a wall that does not meet its neighbour. Gates are the bright bar and two posts. `"labels": true` prints piece and
  camera (`STRAIGHT NW`) on every hex;
- every **route** as the A* polyline (friendly green, enemy red; `A` at the origin, `A'` at the destination) or a big red
  **NO ROUTE** at the destination; magenta crosses mark **refused placements** with the reason;
- optionally (`"flood"`) a faint yellow tint over everything reachable from a route's origin, so a sealed enclosure shows
  as the untinted area.

The footer prints, per scenario, the rules in force, the wall's piece counts, every refused placement and one line per route:
`ROUTE A ENEMY 206,-653 > 207,-649: NO ROUTE   (OLD RULES 5 STEPS COST 5.3)` or `... 7 STEPS  COST 7.5 ...`. "Old rules" is
the same pair under the backend's current rules (no new restriction, no wall), for comparison.

### Scenario files

`scenarios/<name>.json` (the file name is the scenario's `name`):

```jsonc
{
  "name": "c-sea-end-seals",           // required; also the PNG's name
  "title": "one line: what it shows",  // shown in the footer; only characters the bitmap font has (checked by the tests)
  "seed": 11, "radius": 1000,          // the world (radius is part of the terrain)
  "window": { "q": 205, "r": -650, "size": 22 },   // centre hex and hexes across, like --window
  "px": 36,                            // pixels per hex circumradius (default 22)
  "wallLines": [[[200,-651],[210,-651]]],   // polylines of corners; every hex on the hex lines between them is a wall hex
  "walls": [[200,-651], [201,-651]],   // explicit wall hexes, placed one by one after the lines; a sea hex last is the sea end
  "gates": [[205,-651]],               // wall hexes upgraded to gates once the wall stands
  "attempts": [[7,8], [9,9,"gate"]],   // extra placements tried last: accepted ones join the wall, refused ones are marked
  "routes": [{ "from": [206,-653], "to": [207,-649], "army": "enemy" /* or friendly */, "label": "A" }],
  "rules": { "wideRivers": true, "mountains": true, "palisade": true },   // each on by default; turn one off to compare
  "flood": 0,                          // tint what is reachable from route 0's origin (true = route 0)
  "labels": true                       // print piece and camera on every wall hex
}
```

Coordinates are axial `[q, r]`. Wall hexes are placed in order through `canPlacePalisade`, so a hex the rules refuse (a branch,
a gate that is not on a straight, a river, mountain, lake or bog hex, a second sea end, ...) is not drawn as wall but marked and
named in the footer. Friendly routes pass gate hexes, enemy routes do not; every route pays the backend's costs (grass 1.0,
sand 1.1, forest 1.3, bog 2.0, +8 to enter a river hex) with the rules above switched on through `PathContext.restrictions`
(`src/frontend/src/lib/map/hexPath.ts`: default off, so the game's own pathing is unchanged).

A route whose origin or destination is itself impassable (a mountain, a wall, sea) reports `NO ROUTE (DESTINATION IS A MOUNTAIN)`
rather than silently blaming the wall; pick endpoints on walkable land.

The shipped scenarios, all on seed 11 at radius 1000:

| file | shows |
| --- | --- |
| `a-wide-river-vs-stream` | route A across a wide river walks 33 steps upstream to where it starts as a stream (cost 45.6, was 15.7); route B across a stream goes straight over at +8, same as before |
| `b-mountains-block` | mountains impassable: the route round a horseshoe ridge is 25 steps instead of 8 |
| `c-sea-end-seals` | wall from a wide river to the sea, ending in `palisade_end_coast`, with a gate: the enemy has no route in, the friendly army walks through the gate |
| `d-land-end-at-coast` | the same wall with a plain land end: the enemy walks over the half-open end at a penalty (see below) |
| `d2-land-end-one-short` | the same wall one hex short of the coast: round the end or over it, whichever is cheaper |
| `e-mountain-to-river-seals` | a five-hex wall from a mountain to a wide river seals 888 hexes |
| `f-every-piece` | every piece and rotation (ends and straights on all axes, gate, `bend120` as a ring and a meander, `bend60` as two triangles, sea end) with a refused branch and a refused gate marked |

### What the rules turned out to mean on the hex grid

- **A palisade's land end is half open** (scenario d). Sea is impassable and the end hex is blocked, so a wall tip touching
  open sea would seal exactly like a sea end (a hex grid has no diagonal moves) and the sea-end piece would add nothing. The
  owner's rule: a hex resolved as `palisade_end` is passable for every army, friendly or enemy, at `HALF_OPEN_END_COST` = 3.0
  instead of its terrain cost (`PathRestrictions.halfOpen`, off by default; the caller decides which hexes).
  **Exception:** an end that touches a mountain or a wide river is *sealed* (`classifyEnd` in `palisadeTiles.ts`) and blocks like
  any wall hex, so a wall run up to a river or a mountain still seals (scenarios c and e). Every other piece stays blocked:
  straights and bends always, the gate for enemies, and `palisade_end_coast` on its water hex, so a wall ending in the sea-end
  piece seals (c). In the render a half-open end is an orange ring, a sealed end a solid square. In d the enemy walks over the end
  hex (7 steps, cost 9.4); d2 (one hex short) goes round or over, whichever is cheaper.
- **`bend60` only exists in a triangle.** Its two edges are adjacent, so the two neighbours it joins are neighbours of each
  other, and each of the three hexes then has exactly two wall neighbours. A bend60 can never be part of an open line (a
  fourth hex would branch); in `f-every-piece` it is two three-hex triangles. Likewise two wall arms one hex apart branch.
- **A `widen` or `riverstream` hex is crossable** under "wide = width `river`": it is a gap in an otherwise wide line (a stream
  joining a river). `pathing-stats.ts` measures that variant too; it adds about 0.1 points of unreachable land.
- **Mountains are 15.6 % of all land**, so making them impassable cuts islands apart far more than wide rivers do.

### Why land is cut off

`pathing-cutoff.ts --seeds 1-8 --radius 1000` classifies every cut-off region (walkable land outside its island's largest
walkable region) by the impassable hexes on its border (mountain, sea, wide river, lake), gives the region size distribution
and counts how many mountain hexes touch the sea, sand, a wide river or a lake. A scenario with `"cutoff": true`
(`g-cutoff-worst`, `g-cutoff-typical`) tints that land magenta.

Findings: mountains are generated only in an island's core (`terrainAt` in `worldGenerator.ts`: `island.t < mountainThreshold`
0.4 and the ridge field above `mountainRockiness`; sand needs `island.t > beachThreshold` 0.9, the coast rim), so a band of
grass or forest always separates them from the sea: 2 of 164,836 mountain hexes touch it. Mountains do touch rivers (10.7 %
any river, since springs rise on them; 0.8 % a wide one) and never a lake. Cut-off land is mostly a valley closed in by mountains
alone (see the table the diagnosis printed in the PR).

### Whole-world statistics

`pathing-stats.ts --seeds 1-8 --radius 1000 [--islands]` measures, per island (a landmass of at least 6 hexes), how much
walkable land is outside the island's largest connected walkable region under five rule sets (old rules; the decided rules;
the decided rules with `widen`/`riverstream` also impassable; mountains only; wide rivers only), plus how much land is itself
impassable.

## Tests

`npx vitest run ../../scripts/worldgen-preview` (also part of `npm run test:unit`): PNG
encoder round-trip and CRC, legend/colour-table agreement, font coverage, CLI parsing, and the pathing preview: centrelines
square to their edges and meeting their neighbours for every piece, the shipped scenarios' verdicts (a few seconds each:
they generate the real world), the statistics.

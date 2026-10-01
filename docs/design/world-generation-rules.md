# World generation rules

The project owner's requirements for the world-generation overhaul (2026-09-30), grouped. This page is
the requirement list for the whole overhaul, delivered in several PRs; each section says what is
**implemented** and what is **planned**. Mechanics of what is implemented live in
[`river-generation.md`](./river-generation.md).

| Area | Status |
|---|---|
| World size and island shape (v3), world-edge rule, byte-identical C#/TS | Implemented (island-shape PR) |
| Cell-based generation that scales to radius 4000 | Implemented (island-shape PR) |
| Preview tool | Implemented (island-shape PR; later layers arrive with their features) |
| Fog: chunked explored store and mask delivery; default radius 4000 | Planned |
| Rivers and streams; coherent mountain ranges | Implemented (streams PR, bog entry in the bog PR) |
| Bog and lakes, bog buildings, landing spots with bog in reach | Implemented (bog PR, bog buildings PR); see [`bog.md`](./bog.md) |
| Wildlife camps: placement, levels, guard ranges, rendering (no gameplay) | Implemented (camps PR; bog camps in the bog PR) |
| Island density: about twice the islands, same island sizes, no fused islands | Implemented (island-density PR) |

## World and islands

- The world is about 100x bigger in area than before: the default radius is **4000**
  (`WorldGenerationOptions.Radius`, maximum 5000). *Implemented, now that fog is chunked: generation cost is
  proportional to land, not to the sea.*
- Islands are much bigger and irregular: curved and crescent (C) spines, rough fjord-like coasts, bays and
  satellite islets. *Implemented (island shape v3).*
- A mix of sizes: mostly **B** (~150 hexes across, 5k-15k tiles), some **A** (~80 across, 1.5k-7k tiles) and
  a few **C** (~250 across, 15k-40k tiles). *Implemented: size classes with 30% A, 7% C (of cells; 12% on the
  260-hex cells before the density change), the rest B; large islands clear their neighbouring cells.*
- "Nice islands but not many - could be twice as much": about **twice the islands** at the same island sizes,
  without fusing them into blobs. *Implemented (island-density PR), see [Island density](#island-density).*
- O-shaped islands are fine. An enclosed inner water pocket, not connected to the open sea, is filled with
  bog and a lake, and rivers sink into it. *Implemented (bog PR): a pocket too thin or touching open sea stays sea.*
- Islands are never cut off at cell ("chunk") borders or at the world edge: an island that could cross the
  world radius is not generated. *Implemented: the reach clamp keeps every island inside the block of cells a
  hex scans (`ScanSpan` rings: 5x5 at the default 150-hex cells, 3x3 on legacy worlds), and an island whose
  centre distance plus 1.42x its reach exceeds the radius is dropped, which is why the world radius is now part
  of the generation constants sent to the client.*
- The C# and TypeScript generators stay byte-identical, held by shared golden fixtures
  (`src/shared/island-shape-golden.json`, `terrain-checksum-golden.json`, `river-generation-golden.json`,
  `wasted-terrain-golden.json`). *Implemented.*
- Fog: a chunked explored store where a fully explored chunk is stored compressed (one flag), and chunked
  mask delivery. *Planned.*

## Island density

*Implemented (island-density PR).* The radius-4000 world had 270 islands on 5.5% land with a median sea lane of
113 hexes: plenty of sea, not many islands. The rule now:

- **Cells of 150 hexes** (`IslandCellSize`, from 260), still `IslandChance` 0.8 per cell, so about three times
  the island cells.
- **Island size no longer depends on the cell size**: the reach clamp is `IslandMaxReach` = 305 hexes (what
  260-hex cells allowed), and a hex scans as many rings of cells as that needs (`IslandShapeConstants.ScanSpan`:
  2 rings, a 5x5 block, at 150-hex cells). Shrinking the cells alone would have shrunk the big islands with them.
- **Min sea gap** (`IslandMinGap` = 24 hexes): an island whose nominal coast (spine capsules at their
  half-widths, islets at their radii, before the shoreline noise) comes closer than that to a neighbour that
  outranks it - a larger class, or the same class and a higher `+307` roll - is not generated. Neighbours are
  compared before the world edge and the rule itself (candidates), so it needs no recursion, does not depend
  on evaluation order or on the world radius, and checks every ring two islands could meet in
  (`IslandShapeConstants.GapSpan`, 4 at the defaults). No two kept islands are ever closer than the gap.
- **Wasted (end-game) islands keep the same gap.** They are seeded per cell on their own grid
  (`WastedSeedOffset`, `WastedIslandChanceFactor` 0.5 on worlds with the density rules, `LegacyWastedIslandChanceFactor` 0.1 on
  legacy worlds, never in a green island's cell) and go through the same
  min-gap rule among themselves (ranked the same way, candidates against candidates). On top of that a wasted
  island is not generated when its nominal coast comes within `IslandMinGap` of any *kept* green island's (the
  same `IslandsTooClose` measure, `GapSpan` rings): green land always wins. Before this, a wasted island was only
  kept off green hexes and their neighbours, so it was generated hard against (or wrapped around) a green coast
  and broke into fragments there. Legacy worlds (`IslandMinGap` 0) skip both checks and keep their wasted terrain
  byte-identical (`legacy_density_seed_2_with_wasted_islands` in `island-shape-golden.json` pins one with a wasted
  island crowding a green one).
- **`IslandLargeShare` 0.07** (from 0.12): on smaller cells the "large clears its 8 neighbours" rule clears
  less sea, so C would otherwise grow to ~23% of the islands; 0.07 keeps the class mix where it was.
- **Legacy worlds keep their map**: both new knobs are persisted per world; the migration gives existing worlds
  `IslandMaxReach` = 0 (the old one-ring budget, a 3x3 scan) and `IslandMinGap` = 0 (rule off), and they keep
  their own cell size and large share, so their terrain is byte-identical. `WorldGenerationOptions.Compact`
  scales the same way (66-hex cells from 90, reach 103, gap 8: 2.1x the islands).

Measured with the real generator over seeds 1-6 at radius 4000 (the default world; scratch script over
`worldGenerator.ts`; landmasses found the way `WorldGenerator` does; per island = the largest landmass its cell
owns; sea lane = coast-to-coast distance from each landmass of 1000+ tiles to the nearest other one):

| per seed (mean of 6) | before (260 cells) | after | ratio |
|---|---|---|---|
| island cells kept (A / B / C) | 270 (74 / 157 / 39) | 526 (133 / 314 / 79) | **1.95x** |
| landmasses >= 1000 tiles / >= 100 / >= 6 | 282 / 461 / 693 | 554 / 891 / 1341 | 1.96x / 1.93x / 1.94x |
| land share of the world disc | 5.5% | 10.5% | 1.9x |
| class mix A / B / C | 27 / 58 / 14% | 25 / 60 / 15% | same |
| landmasses fused from 2+ island cells | 3.3 | 0 | - |

| island size, tiles (median, p25-p75) | before | after |
|---|---|---|
| A | 2600 (1760-3370) | 2190 (1660-3020) |
| B | 8730 (6200-11660) | 7960 (5850-10780) |
| C | 23900 (15700-31000) | 23200 (16000-30300) |

| sea lane to the nearest island, hexes (islands of 1000+ tiles) | before | after |
|---|---|---|
| p10 / p25 / median / p75 | 40 / 71 / 113 / 168 | 30 / 43 / 64 / 91 |
| lanes under 10 hexes / under 20 | 1.9% / 3.8% | 0.3% / 1.7% |

The island sizes are the same distribution (the clamp is unchanged; the slightly lower A/B medians are the gap
rule thinning the bigger, more crowding candidates, and the old numbers include fused blobs). The sea lanes are
about what doubling the islands must cost (1/sqrt(2) of the spacing), but the near-touching ones the old rule
let through are almost gone. Exactly 2x is reachable (gap 20 with large share 0.08: 1.99x) at more lanes under
20 hexes; a gap of 32 would keep the old p10 lane (39) at 1.74x. 24 is the middle: about twice the islands with
fewer close calls than before.

Wasted islands at the default world, seeds 1-6 at radius 4000 (same scratch script; nominal gap = the
`IslandsTooClose` measure; hex gap = sea steps from wasted land to the nearest green land, through the
shoreline noise):

| per seed (mean of 6) | before the wasted gap rule | after |
|---|---|---|
| wasted island cells kept | 32.2 | 11.7 |
| wasted landmasses >= 6 tiles (seed 1) | 80.8 (94) | 27.3 (28) |
| wasted cells within 24 hexes of a green island | 20.5 | 0 |
| smallest nominal gap wasted-green / wasted-wasted | overlap by up to 67 / 44 | 25.2 / 103 |
| smallest hex gap to green land (any seed) | 2 steps (one sea hex, the neighbour rule) | 18 steps |

Two thirds of the wasted cells sat within the gap of a green island (on 150-hex cells almost every cell
borders a green one), so the count falls to about a third; the many fragments a crowded wasted island broke
into go with it.

Owner decision: keep about as many wasted islands as the denser grid gave before the gap rule, without any
touching green land. `WastedIslandChanceFactor` is therefore 0.5 (from 0.1) for worlds on the density rules
(`IslandMaxReach` above 0); legacy worlds (`IslandMaxReach` 0) keep `LegacyWastedIslandChanceFactor` 0.1 and their
wasted terrain byte-identical. The factor is keyed on the reach rather than the gap so that turning only the gap
rule off (as the tests do) still rolls the same candidates. Wasted landmasses per seed (preview tool footer,
radius 4000):

| seed | 1 | 2 | 3 | 4 | 5 | 6 | mean |
|---|---|---|---|---|---|---|---|
| 0.1, no gap rule | 94 | 94 | 91 | 83 | 51 | 72 | 80.8 |
| 0.1, gap rule | 28 | 29 | 31 | 37 | 15 | 24 | 27.3 |
| **0.5, gap rule** | 103 | 123 | 147 | 106 | 99 | 115 | 115.5 |

Every one of them keeps the 24-hex gap from green land and from each other.

## Rivers and streams

*Implemented (streams PR) except the bog entry, which arrives with the bog. Mechanics:
[`river-generation.md`](./river-generation.md#streams-springs-merging-and-late-widening).*

- More rivers per island; streams should more often combine into bigger rivers. *Implemented as drainage
  networks: a few outlets on bays per island, a noisy shortest-path drainage field over (tile, arrival
  direction) states, one spring per 500 land tiles (1-24) following the field, tributaries joining at Ys the art
  can draw (including a stream into a river at the wide Y). Seeds 1-8 at radius 1000: about 15 rivers per island
  with rivers, over half of them tributaries, mean spring-to-mouth length ~33 tiles; see the doc for the
  knobs and the measurements.*
- A new river starts as a small stream and stays small for the first half of its run. It widens only where two
  streams join, or on a straight tile chosen at random within the second half of the stream's run before it
  must be river-width (sea mouth, bog, meeting a river). Never in the first half, and not always at the very
  last tile of a long run (that reads as artificial); the second half, rather than the last quarter, leaves
  enough river-width tiles for the river buildings (Sawmill, Crop Mill, Hammerschmiede).
- Springs are chosen as far apart from each other as possible so there are few parallel river runs.

The old collision rule's limitation (about 2% of river mouths inland, a third river dropped at a full
confluence: "merge two, drop the third") is gone for green islands: merging is decided while tracing and only
into a tile whose Y the art can draw, so every path ends at a sea mouth or a confluence with an outflow
(`RiverStreamTests` asserts it). Lava rivers keep the old rule.

## Bog and lakes

*Implemented (bog PR): see [`bog.md`](./bog.md) for the algorithm, knobs and measured stats. The rules below hold as R1-R12 checks (`BogRules.cs`, `bogRules.ts`, preview tool).*

- Always one river hits the bogland and runs through its lake.
- Bogland may spawn or sink rivers as an exception (below 20% chance); the best use is to sink an
  additional river while one still runs through.
- Bogland never touches the sea or the coastal sand (inland only).
- Padding (R12, owner: "bog+lake tiles should have some padding bog around"): every lake, shore, mouth, creek and creek-spring tile has
  all six neighbours inside the bog, so at least one ring of bog separates water features from grass and forest; only a creek may touch
  the river its own flow link leads to. A site that cannot get its ring (a mountain or a foreign river beside it) is dropped.
- No holes (owner: forest/grass patches inside a bog made one bog look like two): a group of grass or forest enclosed by bog with no
  path out that does not cross bog becomes plain moss; mountains inside stay mountains.
- The art's map rules: a bog tile touches at most 3 lake tiles and they are contiguous (fill notches);
  separate lakes are at least 2 tiles apart; creeks are straight or a 120-degree bend only, and end in a
  spring or a lake mouth; a creek meets a lake only at a mouth (inlet shore with the creek opposite its water
  edge; inflow = outflow tile); a fish weir only near a lake fisher hut; no walkways.
- Buildings in scope: bog-ore works (iron), Clay Brickworks on bog (the grass version is dropped), Fishing Hut
  on a bog-lake half shore, Hammerschmiede on a bog creek; landing spots need bog in reach. *Implemented (bog buildings PR)*:
  see [`bog.md`](./bog.md), "Buildings" and "Decisions".
- More bogs (owner decision): every island of 150 or more land tiles that has a landing-spot candidate gets at least one bog, so the
  landing-spot rule keeps spots on 140 of the 273 islands of seeds 1-8 at radius 1000 (94 without the guarantee; 177 have a candidate; the
  padding ring (R12) costs four islands the bog they had, 144 before it).
  The bog comes from a relaxed through-river site first, else a small **spawn bog** (a creek spring feeds the lake, its outflow is traced
  as a river to the sea, so one river still runs through the lake). Consequence for the 20% rule above: rolled sinks and spawns are
  4.4% of all bogs, but the guarantee's spawn bogs (18.1% of all bogs) spawn a river by construction, 22.5% together. Islands with no
  inland room stay without bog. See [`bog.md`](./bog.md), "Implemented generation" step 5. On the denser terrain of the island
  density PR: 273 of the 482 green islands of seeds 1-8 at radius 1000 have landing spots (338 have a candidate), after giving the
  spawned river an outlet in every drainage basin and growing the guarantee's lakes only onto shore-fit tiles (258 before; see
  `bog.md`, "On the denser terrain").

## Wildlife camps

*Implemented (bog camps too, on plain bog tiles): see [`wildlife-camps.md`](./wildlife-camps.md).* Spawn and render only for now (no gameplay yet). Every island of 60 or more land tiles gets camps (islets below that get none); a small island whose
only start positions sit inside a strong camp's guard range is simply not a start island. Camps are placed before start positions; start positions keep away from strong camps,
weak camps are fine nearby.

- Strong (will block towers later): wolves, bears, boars, Fenrir.
- Weak (won't block): seals, eagles, beavers, cranes, moose (undecided).
- Camp type follows the ground: wolfden on grass, boarwallow in forest, sealhaulout on sand, bearrapids on a
  straight river, eagleeyrie on mountain, moosemire / beaverlodge / cranedance on bog, fenrirbrood on wasted
  land.

## Tooling

A repo dev tool renders world previews from the real TS generator, with a legend and layer toggles
(rivers/streams, bog/lakes, wasted, camps). *Implemented: `scripts/worldgen-preview/` with the `terrain`, `wasted`, `rivers`
`camps` and `bog` layers and a stats footer with per-rule violation counts (see its README).*

A server-side review of a whole seed (cut-off land, missing bogs, islands without landing spots, broken guarantees) runs
in the admin reseed panel and as a CLI: see "World review" below.

## World review

A seed can be fine by every generator rule and still play badly: a valley nobody can walk into, a big island without the
bog its landing spots need. The world review (`Bjarnoy.Domain.World.Review.WorldReview`, server-side only) lists those per
seed so an admin can switch seed before committing it. *Implemented: the admin reseed panel, the `review-seeds` endpoint and
a CLI.*

Checks (each independent, `WorldReview.DefaultChecks`; every threshold is a constant in `WorldReviewThresholds`):

| Kind | Severity | What it finds |
| --- | --- | --- |
| `cutOffLand` | info, warn from 50 hexes or 5% of the island's walkable land, error from 500 hexes | Walkable land a land army cannot reach from its island's shore or landing spots when wide rivers and mountains are impassable - the rule set #366 previews. Walkable and wide river are #366's definitions exactly: grass, sand, forest or bog moss that is not a wide river; a river hex is wide when at least two of its arms are river width (river tiles and river-stream Ys, not widen tiles or streams). Regions under 6 hexes count towards the total but are not listed. |
| `missingBog` | warn, error from 500 land tiles | A green island of `BogGuaranteeMinTiles` (150)+ land tiles with a landing candidate (the bog guarantee's terrain-only rule) but no bog at all. Off when the guarantee is (compact preset). |
| `noLandingSpots` | warn | A green island with a landing candidate but no landing spot after giants, strong camps and the bog-in-reach rule. |
| `bogRuleViolation` | error | Any bog rule R1-R12 broken (`BogRules`). The generator guarantees 0. |
| `inlandRiverMouth` | error | A river mouth with no sea beside it. The generator guarantees 0. |
| `wastedNearGreen` | info, warn when touching (1 hex or overlapping) | A wasted island within 4 hexes of a green one. |

The summary also counts landing spots, islands with a landing candidate, every cut-off hex (also the small regions) and
the cut-off share of all walkable land and of the worst island. Seeds rank best first by errors, then warnings, then
cut-off hexes, then most landing spots.

Where the cut-off measure differs from #366's own statistic (`pathing-stats.ts`): #366 counts what lies outside each
island's largest walkable region; the review counts what cannot be walked to from any shore hex (a walkable hex beside the
open sea, not a bog lake) or landing spot, because an army lands from the sea - a valley that opens onto a beach is reachable.

**Admin panel** (`/admin/worlds/{id}/reseed`): "Preview seed" now shows the review beside the preview map - the counts, and
a findings table (severity, kind, island, message) filtered by severity; clicking a finding centres the map on its hex.
"Scan seeds" reviews up to 8 consecutive seeds with the generation parameters above
(`POST /api/v1/admin/worlds/{id}/review-seeds`, admin only, persists nothing) and lists them best first, each with a
button to preview it. Seeds run in parallel on half the cores; a radius-1000 seed takes 1-5 s, a radius-4000 seed 15-25 s
to generate plus ~3 s to review (about 0.5-0.7 GB each while it runs), so 8 seeds at radius 4000 take a couple of minutes
in one request - fine for an admin tool behind no proxy timeout, but a background job would be the next step if scans
of production-size worlds become routine.

**CLI** (for developers and agents re-pinning seeds or checking a generator change; no database, no server):

```bash
cd src/backend
dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 1-8 --radius 1000
dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 1-4 --radius 4000 --findings 20
dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 7 --json   # one JSON object per seed
```

It prints per seed the generation and review time, the summary and the worst findings, then the findings per kind and the
seeds ranked best first. `--compact` uses the compact preset; `--findings -1` prints every finding.

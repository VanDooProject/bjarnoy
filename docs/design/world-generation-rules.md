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

## World and islands

- The world is about 100x bigger in area than before: the default radius is **4000**
  (`WorldGenerationOptions.Radius`, maximum 5000). *Implemented, now that fog is chunked: generation cost is
  proportional to land, not to the sea.*
- Islands are much bigger and irregular: curved and crescent (C) spines, rough fjord-like coasts, bays and
  satellite islets. *Implemented (island shape v3).*
- A mix of sizes: mostly **B** (~150 hexes across, 5k-15k tiles), some **A** (~80 across, 1.5k-7k tiles) and
  a few **C** (~250 across, 15k-40k tiles). *Implemented: size classes with 30% A, 12% C (of cells), the
  rest B; large islands clear their neighbouring cells.*
- O-shaped islands are fine. An enclosed inner water pocket, not connected to the open sea, is filled with
  bog and a lake, and rivers sink into it. *Implemented (bog PR): a pocket too thin or touching open sea stays sea.*
- Islands are never cut off at cell ("chunk") borders or at the world edge: an island that could cross the
  world radius is not generated. *Implemented: the reach clamp keeps every island inside the 3x3 cell block a
  hex scans, and an island whose centre distance plus 1.42x its reach exceeds the radius is dropped, which is
  why the world radius is now part of the generation constants sent to the client.*
- The C# and TypeScript generators stay byte-identical, held by shared golden fixtures
  (`src/shared/island-shape-golden.json`, `terrain-checksum-golden.json`, `river-generation-golden.json`,
  `wasted-terrain-golden.json`). *Implemented.*
- Fog: a chunked explored store where a fully explored chunk is stored compressed (one flag), and chunked
  mask delivery. *Planned.*

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
  inland room stay without bog. See [`bog.md`](./bog.md), "Implemented generation" step 5.

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

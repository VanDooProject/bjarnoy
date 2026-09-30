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
| Rivers and streams | Planned |
| Bog and lakes | Planned |
| Wildlife camps | Planned |

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
  bog and a lake, and rivers sink into it. *Planned (bog and lakes); the generator may already produce
  such pockets.*
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

*All planned.*

- More rivers per island; streams should more often combine into bigger rivers.
- A new river starts as a small stream and stays small for the first half of its run. It widens only where two
  streams join, or on a straight tile chosen at random within the second half of the stream's run before it
  must be river-width (sea mouth, bog, meeting a river). Never in the first half, and not always at the very
  last tile of a long run (that reads as artificial); the second half, rather than the last quarter, leaves
  enough river-width tiles for the river buildings (Sawmill, Crop Mill, Hammerschmiede).
- Springs are chosen as far apart from each other as possible so there are few parallel river runs.

Known limitation of the current collision rule (relevant to the rework): about 2% of river mouths at
production scale are inland, where a third river was dropped at a confluence that already had two inflows
("merge two, drop the third").

## Bog and lakes

*All planned.*

- Always one river hits the bogland and runs through its lake.
- Bogland may spawn or sink rivers as an exception (below 20% chance); the best use is to sink an
  additional river while one still runs through.
- Bogland never touches the sea or the coastal sand (inland only).
- The art's map rules: a bog tile touches at most 3 lake tiles and they are contiguous (fill notches);
  separate lakes are at least 2 tiles apart; creeks are straight or a 120-degree bend only, and end in a
  spring or a lake mouth; a creek meets a lake only at a mouth (inlet shore with the creek opposite its water
  edge; inflow = outflow tile); a fish weir only near a lake fisher hut; no walkways.
- Buildings in scope: bog-ore works (iron), Clay Brickworks on bog (the grass version is dropped), Fisher Hut
  on a bog-lake shore; landing spots need bog in reach.

## Wildlife camps

*All planned.* Spawn and render only for now (no gameplay yet). Every island can get camps (all islands can
be start islands). Camps are placed before start positions; start positions keep away from strong camps,
weak camps are fine nearby.

- Strong (will block towers later): wolves, bears, boars, Fenrir.
- Weak (won't block): seals, eagles, beavers, cranes, moose (undecided).
- Camp type follows the ground: wolfden on grass, boarwallow in forest, sealhaulout on sand, bearrapids on a
  straight river, eagleeyrie on mountain, moosemire / beaverlodge / cranedance on bog, fenrirbrood on wasted
  land.

## Tooling

A repo dev tool renders world previews from the real TS generator, with a legend and layer toggles
(rivers/streams, bog/lakes, wasted, camps). *Implemented: `scripts/worldgen-preview/` with the `terrain` and
`wasted` layers and a stats footer (see its README); `rivers`, `bog` and `camps` arrive with their features.*

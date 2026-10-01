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
per map rule R1-R12 (must all be 0)**, checked by `bogRules.ts` (the twin of the backend's `BogRules`). The rivers layer
follows a river through a lake, so its `inland mouths` count stays 0.

`npx tsx ../../scripts/worldgen-preview/bog-stats.ts --seeds 1-8 --radius 1000` (from `src/frontend`) prints the bog
acceptance statistics over several seeds: bogs and lakes per island, lake sizes, through-river bogs, sinks/spawns shares,
pockets, and the violations per rule.

## Tests

`npx vitest run ../../scripts/worldgen-preview` (also part of `npm run test:unit`): PNG
encoder round-trip and CRC, legend/colour-table agreement, font coverage, CLI parsing.

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
| `--layers a,b` | layers, drawn in order: `terrain` (default), `wasted`, `camps` |
| `--set k=v,...` | override generation constants, e.g. `islandChance=0.5,islandCellSize=200` |
| `--no-legend`, `--no-stats` | drop the legend strip / skip the landmass scan |

The footer prints the island count, the size distribution (`<100 ... >40K` tiles), the number
of A/B/C island cells and timings (terrain sampling, landmass scan). Islands are found the way
the backend's `WorldGenerator` does, so the counts agree with it.

## Adding a layer

A layer is an entry in `LAYERS` in `layers.ts`: an id, a description, its legend entries and a
`colourAt(q, r, world)` that returns a colour (or `null` to keep what the layers below drew).
The legend strip is generated from the layers' own colour tables, so the picture and its
legend cannot drift. Planned: `rivers`, `bog` (added with the features that generate them). A layer may also draw markers over the finished map (`overlay`, used by `camps`: a marker per family, a ring at the guard range, magenta strong / cyan weak) and add footer lines (`stats`).

The `camps` layer runs the client ports of the backend pipeline (rivers, giants, camps) island by island in the backend's own island order, so it shows what a server world holds; with `--window` only the islands in view are generated. Its footer gives camps per island (min/median/max), per family and strong/weak.

## Tests

`npx vitest run ../../scripts/worldgen-preview` (also part of `npm run test:unit`): PNG
encoder round-trip and CRC, legend/colour-table agreement, font coverage, CLI parsing.

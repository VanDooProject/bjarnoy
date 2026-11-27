# Performance: tile art, memory and frame rate

The map's cost is dominated by one thing: tile art. It ships as WebP atlas
pages, and a WebP is only small on the wire. Once the browser decodes a page
for the GPU it is plain RGBA, 4 bytes per pixel, so every 2048 × 2048 page
costs **16 MiB** of memory, however well it compressed. This doc says what
loads when, what it costs, and the settings that decide it.

## What the atlases cost

Measured from the vendored `bg_assets_hextile` atlas (pinned at `c70ef8f`):

| Category | Pages | Download (WebP) | Manifest JSON | Decoded (GPU/RAM) | Loaded |
| --- | ---: | ---: | ---: | ---: | --- |
| `terrain` | 3 | 4.0 MB | 0.20 MB | 48 MiB | always, first (landing page, map) |
| `buildings-static` | 11 | 10.6 MB | 0.68 MB | 176 MiB | settlement view |
| `buildings-anim` | 19 | 15.6 MB | 5.34 MB | **304 MiB** | only while animations are on |
| `wasted-terrain` | 2 | 2.9 MB | 0.11 MB | 32 MiB | once the world's endboss has triggered |
| `wasted-buildings-static` | 3 | 1.9 MB | 0.10 MB | 32 MiB | same |
| `wasted-buildings-anim` | 9 | 3.8 MB | 0.96 MB | 144 MiB | same, and only while animations are on |
| `frozen-terrain` | 2 | 2.1 MB | 0.09 MB | 32 MiB | worlds with `FrozenIslesEnabled` |
| `showcase` | 68 | 31.9 MB | 0.88 MB | 1088 MiB | docs pages only, never the game |

A player on a normal world, with animations off, holds terrain plus static
buildings: about **224 MiB**. Animations add 304 MiB on top (448 MiB more
once the wasted pack is in). That is why they are the setting this doc is
mostly about.

Every animated clip also has a static frame in the static/terrain atlases,
so turning animations off never leaves a building without art: the map just
draws the static frame.

### Where the savings came from

- **Parts-only animation frames** (3D_assets#92): an animation frame used to
  be the whole building re-rendered per frame. It is now only the moving
  parts, drawn over one `_rest` image of the building with those parts
  hidden. Across all tiles: 48 → 27 pages, 62 → 30 MB download,
  805 → 453 MiB decoded. The giant volcano gained nothing, because its cone
  meshes are tagged as animated; splitting the lava faces into their own
  meshes would fix that.
- **Packs by family** (3D_assets#93, bjarnoy#299): the wasted and frozen
  art live in their own `wasted-*`/`frozen-*` categories and load only when
  the world actually has them (see "Packs" below).
- **Animations on auto** (see below): the anim categories are not loaded at
  all until the device has shown it can afford them.

## Packs

`build_atlas.py` splits the art into a core pack and one pack per family
(`CONFIG["packs"]`), each with its own `terrain`/`buildings-static`/
`buildings-anim` categories. The map loads a pack only once the world
reveals it:

- **core**: always.
- **wasted**: once the world's endboss has triggered
  (`WorldModel.isWastedRevealed`, from the world's `endbossTriggered`).
  `HexMapRenderer.maybeLoadWastedPack` runs from every rebuild, so a reveal
  mid-session loads it too.
- **frozen**: worlds with the `FrozenIslesEnabled` flag, set per world in
  the admin UI (`HexMapRenderer.maybeLoadFrozenPack`). Nothing generates
  frozen terrain yet; the flag is where the planned northern frozen isles
  (with their ground treasures) will hang off.

Showcase renders are docs art and never load in the game.

## Animations: auto, on, off

The setting is **per device** (localStorage `bjarnoy.animations`), not per
account: the same player may want animations on a desktop and not on a
phone. It is in the Settings dialog (Graphics →
Building animations), open to anonymous players too, next to a line saying what it currently resolves to and
why. Water motion, fog drift and menu animations sit beside it (localStorage
`bjarnoy.motion.water|fog|hud`): each is Auto/On/Off, where Auto follows the
device's own "reduce motion" setting (shown at the top of the section) and Off
freezes water/fog in place rather than hiding them.

| Setting | Result |
| --- | --- |
| **Auto** (default) | Off at first. Enabled only once the map has run at ≥ 30 fps for 10 s *without* animations. Turned off again if it then drops below 30 fps for 5 s. After a drop there is one retry: ≥ 60 fps for 30 s turns them on again. A second drop latches them off for the rest of the page session. Off outright under reduced motion or data saver. |
| **On** | Always on, on this device, even with reduced motion or data saver: the player chose it explicitly. |
| **Off** | Always off. Releases the anim textures. |

Why these rules:

- **Measure without animations first.** The question auto answers is "can
  this device afford 304 MiB more and the per-frame clip updates?". A device
  that barely holds 30 fps on the static map can't, so it never starts
  loading them.
- **10 s sustained, averaged over 1 s buckets.** One long frame (a GC, a
  rebuild after a pan) is not the device being slow, so single hitches don't
  restart the window; a second that averages under 30 fps does. The bar is
  the same 30 fps that turns animations off again, and the window is short,
  so a normal desktop gets there instead of losing the streak to an
  occasional slow second (55 fps for 30 s rarely finished on real hardware).
- **Shown live.** Under "Building animations" the Graphics settings show the
  last second's fps and how many seconds of the current window (enable, retry
  or drop) are collected (`animationPreference.progress`).
- **One retry, then latch off.** Animations themselves cost frames. A device
  on the edge would otherwise load them, drop below 30, recover (nothing is
  drawing), load again and drop again. After a drop the stricter retry window
  (≥ 60 fps for 30 s) must show real headroom; a second drop stays off for
  the session.
- **Auto drops keep the textures.** An Auto drop parks the loaded clips
  (`HexMapRenderer.parkedAnimTop`) instead of unloading the atlases, so the
  retry costs no decode. Setting Off, reduced motion and data saver release
  them.
- **Order with the resolution.** Animations go first both ways: resolution
  climbs only once animations are on or latched off, and drops only once
  animations are off (see "Render resolution").
- **Measured on the map, in both modes.** The renderer feeds the governors
  every Pixi tick (`feedFrame` in `lib/perf/frameGovernors.ts`), on the world map as well
  as in a settlement: it is judging the device's general frame cost, so a
  session that starts on the world map arrives at its first settlement with
  the measurement already under way.
- **Reduced motion and data saver** (`prefers-reduced-motion: reduce`,
  `navigator.connection.saveData`) mean no animations and no anim download
  in auto. The Settings dialog shows which one is
  why.

Turning animations off (by setting, or auto dropping them) releases the
anim pages' textures (`unloadAtlasCategory`, `Assets.unload`), so the memory
really comes back rather than just stopping playback. The code is in
`src/frontend/src/lib/perf/animationPreference.ts` (setting and resolution
of the state), `lib/perf/fpsGovernor.ts` (the stepped governor),
`HexMapRenderer.setAnimationsEnabled`/`syncAnimationAtlases`
(load and unload) and `components/settings/AnimationPreferences.vue` (shown
in the Settings dialog, `components/settings/SettingsModal.vue` →
`components/settings/DeviceSettings.vue`).

Docs pages (the tile docs, the wasted lands page) play their own clips with
`useAnimationClock`: frozen under Off, and under reduced motion unless the
setting is On. They don't run the fps governor.

## Hidden tabs and covered maps

The Pixi ticker stops when the tab is hidden (`document.hidden`) and starts
again when it is visible, so a background tab doesn't render, advance clips
or rebuild. A tab that is visible but not focused (another window in front,
a second monitor) keeps rendering and animating: that is a player watching
the map.

The ticker also stops while a phone-size route modal (profile, reports,
leaderboards, ...) covers the whole screen with an opaque panel, and starts
again when it closes (`useMapCover` -> `HexMapRenderer.setCovered`). A desktop
modal leaves the map visible behind its backdrop and keeps it running.

### Active and background frames

Both fps governors (animations and resolution) count only active frames.
`lib/perf/frameActivity.ts` classifies every frame; a background frame counts
for nothing, and every edge between active and background restarts the
governors' running windows (`feedFrame` in `lib/perf/frameGovernors.ts`).
A frame is background when:

- the tab is hidden (`document.hidden`);
- the window is not focused (`document.hasFocus()` is false: another window in
  front, a second monitor). The renderer keeps rendering; only the counting
  stops;
- its interval is over 250 ms (a resumed or stalled frame);
- the frame rate looks capped by the browser: the last 30 intervals average
  ≥ 30 ms with a standard deviation under 1.5 ms (Chrome battery saver,
  Safari Low Power mode at 30 fps). A struggling GPU jitters; a cap does not.

After any background stretch the first 1000 ms of active frame time is
settling and counts as background too.

Limit of the cap heuristic: a device that is genuinely locked at exactly half
its refresh rate also looks metronomic. Its frames are neither counted as
good nor as bad, so such a device stays where it is.

The Graphics settings replace the measure lines with a "counting paused" line
(by reason) while frames are background (`frameActivityState`).

## Render resolution

The canvas's resolution (device pixels per CSS pixel) is a **per-device**
setting (localStorage `bjarnoy.resolution`), Graphics → Resolution:
**Auto** or one of the levels the screen offers, highest first. An explicit
value is clamped to the highest level the screen has.

- **Levels** (`resolutionLevels`, computed once at load from
  `devicePixelRatio`): the cap is `min(dpr, 2)`; the levels are 1, 1.5 and 2
  up to the cap, plus the cap itself when it is above the last one (1.25 gives
  1, 1.25; 1.75 gives 1, 1.5, 1.75; 3 gives 1, 1.5, 2). A screen with a cap of
  1 has one level and Auto reads "your screen's maximum". A monitor change
  while the page is open is not followed.
- **Auto** starts at the lowest level, 1×. It steps up one level after 10 s at
  ≥ 30 fps and down one level after 5 s under 30 fps. A level it dropped out of
  once needs the retry window (≥ 60 fps for 30 s) to be entered again; after a
  second drop out of it, the level is closed for the session. Every step starts
  its window afresh. The governor is the same `FpsGovernor` as the
  animations' (`lib/perf/fpsGovernor.ts`), with one level per resolution.
- **Order.** Animations go first both ways. Resolution climbs only when the
  animation governor is at its top or its next step is latched (while it still
  waits for a normal or retry window, resolution waits too), and drops only
  once animations are off. With the animation setting forced, resolution
  moves freely. A level change of one governor restarts the other's running
  window, since its measurement ran under other conditions.
- **Applied in place.** `HexMapRenderer.setResolution` calls
  `renderer.resize(width, height, resolution)`; `autoDensity` keeps the CSS
  size, so the map is not remounted. The initial resolution at mount is the
  effective one. The fog's desaturation filter has `resolution: 'inherit'` and
  follows. The fog field and the water/dry-mask render textures are
  world-anchored with resolution 1 and do not depend on the canvas, and Pixi's
  event system picks the new resolution up for pointer positions.
- **Code.** `lib/perf/resolutionPreference.ts` (setting, levels, governor),
  `lib/perf/frameGovernors.ts` (the coordinator), `composables/useHexMapRenderer.ts`
  (the watch) and `components/settings/AnimationPreferences.vue`.

## Compression on the wire

The WebP pages are already compressed; gzip does nothing for them. The JSON
manifests are highly compressible (`buildings-anim-0.json`: 137 KB → 8 KB
gzipped), and the API serves the built frontend through `MapStaticAssets`,
which precompresses static assets with gzip and brotli at publish time
(`deploy/Dockerfile` copies `dist/` into `wwwroot` before `dotnet publish`
for exactly this reason).

## World generation

In a live world the client computes only the per-hex terrain itself (`terrainAt`/`generateTile`: sea, sand, grass,
forest, mountain, plus each hex's look) from the world seed and its generation constants. Everything built per island
(rivers, bogs, giants, camps, endgame sites) is generated once by the server when the world is created, stored, and
sent with the world's island endpoints (see "Island data on the wire" below). The cost of those passes lands on world creation, not on the player's device.
Per-hex terrain costs about 1 µs per hex on a desktop CPU (spine chains and groves, measured 2026-11-01; 0.6 µs before).

Demo mode is a dev tool, not a target for performance work. It has no server, so it runs the per-island passes on the
client when you land; a large island can take seconds there, and that is accepted.

### Island data on the wire

A large world (radius 4000, about 1,300 islands) has about 550,000 bog tiles, 230,000 river tiles and 300,000 start
positions: 77 MB of JSON if one response carries them all, which is what `GET /worlds/{id}/islands` used to do on every
call (reading every island's bog, river and start columns from the database, materializing about a million objects and
serializing them again). Under many simultaneous landing-page loads that saturated the database, the connection pool and
the garbage collector, and even a login took seconds.

These parts only change when a world is reseeded, so they are served from memory instead:

- `/islands` keeps only labels, giants, camps, walls and towers (about 0.3 MB at that size) and does not read the big
  columns.
- `/terrain-chunks` (river and bog tiles) is cut into 64-island chunks, each serialized and gzipped once per world and
  sent as the stored bytes with an `ETag` (a chunk request still reads the world row by primary key, nothing from the islands); the client reads the manifest and then all chunks in parallel. The 77 MB of
  tiles and plots shrink to about 4.6 MB on the wire (3.6 MB of terrain, 1 MB of start positions), and a revisit costs
  `304`s.
- `/start-positions` is the same for the founding plots. The player client does not need them (it founds on the plots the
  plot suggestion offers), so it never fetches them.
- The river index that army orders, field battles and bridge placement ask for is cached per world too, instead of reading
  all river tiles for every order. The cache also keeps which river hexes lie on wasted islands, so a bridge placement
  does not read any island row either.

## Rendering baseline (measured 2026-11-26)

One machine, four framings, one set of numbers to compare later changes
against. These are not a benchmark of a player's device: they are the first
reading on a known setup, so a later reading can say "this got worse" rather
than "this feels slow". Everything below was measured, not estimated; where
the measurement could not separate an effect from the frame clock's own
wobble, it says so.

### Setup

| | |
| --- | --- |
| Machine | Windows 11, 4 logical cores |
| Browser | Chromium 152 (desktop app's in-app browser), WebGL 2 via ANGLE on Intel UHD Graphics (D3D11) |
| Viewport | 1296 × 841 CSS px, device pixel ratio 1 |
| Build | Vite dev server from `src/frontend` (`npx vite --port 5183 --strictPort`), demo mode, `?debug=1` |
| Settings | Defaults: building animations on Auto (not enabled), no motion overrides set |
| Framings | Default settlement (z=0.34), settlement zoomed out (z=0.09), world default (z=0.22), world at the zoom-out clamp (z=0.05); atlas and water mask loaded, camera held still |

The path to the settlement scene was the same one
`scripts/screenshot-helpers/flow.mjs` walks: open `/?debug=1`, press "Go to the
map", click the biased plot on the canvas, then the Settlement tab. The debug
hooks installed for demo mode
(`main.ts`) expose the same counters the perf panels read:
`window.__fogPerf` (`fogPerfStats`), `window.__waterPerf` (`waterPerfStats`),
`window.__fogDebug`, `window.__waterDebug` and `window.__settlementRenderer`.

What those counters cover: Pixi's `Application` is created in
`src/frontend/src/lib/map/HexMapRenderer.ts:2828-2839` and its ticker at `:2981`;
the per-frame pass is at `:3031-3106`, with water/river/bog updates at
`:3085-3087` and fog at `:3094-3104`. The shaders are GLSL strings in TS, not
files: `water/waterShader.ts`, `water/riverShader.ts`,
`water/bogLakeShader.ts` and `fog/fogShader.ts` (one field pass into a render
texture, then two composite quads), sharing `shaderNoise.ts`. Draw order comes
from `worldLayerOrder` (`:1940`); in settlement mode water sits between the
terrain and the borders. A camera move calls `rebuildAll()` (`:4398-4482`),
which writes `fogPerfStats`; `maybeBakeWaterMask()` (`:4499`) writes
`waterPerfStats`. The toggles used in the A/B rows live in
`water/waterDebug.ts:18-131` and `HexMapRenderer.ts:302-354`.

Frame intervals came from `sampleFrames` in
`src/frontend/src/lib/map/water/perfSweep.ts` — the same sampler behind
WaterPerfPanel's **Measure breakdown** button: median plus median absolute
deviation (MAD), discarding the first two frames after a state change. The A/B
rows came from that module's `runPerfSweep`, with WaterPerfPanel's own subject
list; the alternating on/off blocks below repeat the same A/B to check for
machine drift. Rebuild numbers are `rebuildAll()` called repeatedly (ten times
for the default framing, eight for the others) and `__fogPerf` read afterwards;
this is the work a camera pan triggers, measured without waiting on a drag. A browser performance trace and a JS CPU profile
cover ~10 s each, and 60 frames had their WebGL calls counted by wrapping the
context's draw/program/buffer methods from the console.

The heavy framings need one more distinction. `framePacing.ts` deliberately
caps the ticker once a smoothed frame exceeds 50 ms, so what a player sees at
settlement z=0.09 or world z=0.05 is roughly one second between frames even
though the render itself costs 53 ms or 118 ms. To measure the render cost I
called the detach handle returned by `attachFramePacing` from the console, set
`ticker.maxFPS = 0` and `ticker.minFPS = 10`, and reattached the pacer
afterwards. Those unpaced numbers are the ones in the framing table; the paced
interval is listed beside them.

### Steady frame

| Measurement | Value |
| --- | ---: |
| Median frame interval | 43.3–44.7 ms (22–23 fps) across several 6–10 s windows |
| MAD of those intervals | 6.5–7.3 ms |
| `drawElements` per frame | 43 |
| `useProgram` per frame | 32 |
| `bufferSubData` per frame | 4.3 |
| Shader compiles during the window | 0 (7 Pixi `GlProgram`s cached) |
| JS heap in use | ~91 MB (Chrome `performance.memory`; atlas textures live on the GPU, outside this number) |

The frame is not display-paced at this size: 43 ms is well past the 16.7 ms
vsync floor, so an effect switched off has room to show up in the interval. The
CPU profile of the same window is mostly idle (~6.9 s of 8.6 s sampled), with
Pixi's filter path taking most of the rest (`addRenderable` ~246 ms,
`packQuadAttributes` ~119 ms, `collectRenderablesSimple` ~114 ms sampled self
time); the renderer's own tick is single-digit milliseconds in total. This is
a GPU/fill-rate-bound frame, not a JavaScript-bound one.

### Rebuild (camera move)

Ten consecutive `rebuildAll()` calls took 35.9 ms the first time and 12.2–19.6
ms after that (mean ~15 ms). The last `__fogPerf` reading for this scene:

| Phase | ms |
| --- | ---: |
| Terrain (1,048 hexes drawn of 1,087 walked) | 7.9–11.5 |
| Borders (19 bordered hexes) | 1.4–2.2 |
| Bog edges | 0.5–1.0 |
| Markers | 0.1–0.7 |
| **Total** | **10.6–14.3** |

The viewport covers 2,332 hexes; 1,087 of them are walked after the scan clip.
The fog mask fetch took 67.4 ms once (demo mode's in-memory mask; live mode
uses the cached `/fog-mask` response). The water mask was 260 × 198 texels
(51,480), baked on the worker in 135.8 ms; the first bake during load took
435.8 ms. Three bakes happened in the session, all during load/navigation —
the counter stayed put while the camera was still, as it should.

### Layer A/B

The built-in sweep's baseline was 45.9 ms with 0.55 ms drift between its first
and last baseline. Every sample's MAD was about 10 ms, so only a row clearing
that noise is resolved:

| Subject switched off | Frame with it off | Delta | Verdict |
| --- | ---: | ---: | --- |
| Water layer, all of it | 32.5 ms | −13.4 ms | resolved (noise ±10.0) |
| Fog, both tiers | 38.7 ms | −7.2 ms | < noise (±10.0) |
| Surface pattern (nested) | 42.9 ms | −3.0 ms | < noise (±10.0) |
| Coarse net (nested) | 41.5 ms | −4.4 ms | < noise (±10.3) |
| Fine net (nested) | 42.6 ms | −3.3 ms | < noise (±10.0) |
| Shadow pools (nested) | 47.5 ms | not resolved | negative delta |
| Shoreline foam (nested) | 45.4 ms | −0.5 ms | < noise (±10.6) |
| Wave squiggles (world map) | 42.7 ms | −3.2 ms | < noise (±10.0) |

As in the panel, the rows are separate A/Bs against the same baseline: they do
not add up, and the nested rows are already inside the whole-water row.

Running water and fog as alternating on/off blocks (2.5 s per block, twice
each) gave a more consistent answer: water 47.2 ms on → 40.3 ms off, a **6.9 ms**
cost (the two pairs gave 6.5 and 7.4); fog 44.7 → 39.4, **5.3 ms** (pairs 6.1
and 4.4). The machine got faster over the run in both cases, which is why the
pairwise deltas matter more than the raw on/off medians. The individual shader
effects stay inside the noise: water is one fragment shader with each effect
behind a uniform, fog is a field pass into a render texture plus two cheap
composite quads, and river flow has its own mesh. Which effect dominates is
not knowable from the frame clock on this machine; a timer query would be
needed, and this codebase does not have one (hence the missing GPU-time rows
in the perf panels).

### Other framings

The same A/B was repeated at the other framings. `zoomBy` clamps to 0.05–4
(`HexMapRenderer.ts:3880`, `:2717`); 0.09 is still settlement because the
default 0.34 already sits below the 0.4 world-exit threshold
(`zoomTransition.ts:54`), so a single zoom-out step never crosses it.

| Framing | Unpaced frame, median / MAD | Paced interval | Draws / programs per render | Rebuild |
| --- | ---: | ---: | ---: | ---: |
| Settlement, default z=0.34 | 43–45 ms / 6.5–7.3 ms | same (pacer off) | 43 / 32 | 12–20 ms (first 35.9) |
| Settlement, z=0.09 | 52.8 / 10.5 ms | 1,037 ms (MAD 16.4) | ~43 / ~32 | 7.6–31.4 ms |
| World, default z=0.22 | 34.3 / 1.9 ms | same (pacer off) | 9.3 / 7.3 | 4.5–14.3 ms |
| World, z=0.05 | 118.2 / 15.4 ms | 1,038 ms (MAD 10.5) | 8.7 / 6.7 | 4.2–22.4 ms |

Rebuild ranges are eight `rebuildAll()` calls per extra framing; the default
settlement row is the ten-call series above.

Layer costs at the three extra framings, from 6 s on/off blocks with the pacer
detached:

| Framing | All on | Water off | Fog off | Both off | Reading |
| --- | ---: | ---: | ---: | ---: | --- |
| Settlement, z=0.09 | 52.8 | 34.2 | 50.5 | 33.7 | water −18.6 (resolved), fog −2.3 (< MAD) |
| World, default z=0.22 | 34.3 | 33.9 | 34.1 | 34.0 | all inside MAD 1.2–1.9 |
| World, z=0.05 | 118.2 | 34.0 | 117.8 | 34.0 | water −84.2 (resolved), fog −0.4 |

The scene counters show why. At settlement z=0.09 the viewport covers 19,980
hexes; the fog rebuild still walks 1,087 (1,048 drawn) in 18.2 ms, and the water
mask is 804 × 548 texels, baked on the worker in 186.6 ms when the zoom changed.
At world default only 711 terrain hexes are drawn out of the same 1,087 walked,
with 96 waves drawn and 476 culled; fog rebuild is 4.8 ms and the 364 × 263
mask baked in 72.6 ms. At world z=0.05 the viewport covers 52,819 hexes but fog
still draws 711 terrain hexes and no waves, rebuild is 11.7 ms, and the mask
grows to 1,028 × 688 at 359.7 ms to bake. The walked count is set by the scan
clip, not the viewport; zooming out grows the viewport count and the water mask.

### Component profiling

To go below the whole-layer rows I toggled one layer or one debug flag at a
time (`layersByName()`, `waterDebugFlags`, `fogDebugFlags`), twice per subject
(on → off → on → off, 2.5 s per block), with the pacer detached as above. Each
entry is the mean of the two on-minus-off median differences; the pair values
show whether the two runs agreed. Block MADs were 1.9–19.0 ms, so these are
screening measurements, not GPU timings: a negative or sub-MAD delta is
unresolved, not a saving.

At the default settlement framing, after a fresh 260 × 198 mask bake (73.2 ms
on the worker), nothing individual cleared the noise:

| Subject off | Mean Δ (ms) |
| --- | ---: |
| Water layer | +1.1 |
| River flow | +0.7 |
| Bog lakes | −0.4 |
| Terrain base | +1.4 |
| Terrain flat | −0.4 |
| Terrain top | +0.5 |
| Bog edges | −0.4 |
| Rivers | 0.0 |
| Borders | +0.6 |
| Waves | +0.3 |
| Fog, both tiers | +0.8 |

This run's steady frame was ~35 ms, notably faster than the 43–45 ms of the
first baseline session, and the fresh mask baked in 73.2 ms rather than 135.8
ms. The two sessions are both recorded; deltas under the noise are not averaged
across them.

At settlement z=0.09 the whole water layer was +19.4 ms (54.0 → 34.6 ms) after
a fresh 800 × 548 bake (241.8 ms). Its sub-effects were:

| Subject off | Mean Δ | Pair deltas |
| --- | ---: | --- |
| Surface pattern (`midWaterWaves`) | +3.1 | 4.5, 1.7 |
| Coarse caustics | +7.8 | 11.6, 3.9 |
| Fine caustics | +1.7 | 1.2, 2.2 |
| Shadow pools | +3.0 | 1.3, 4.7 |
| Shoreline foam | −0.8 | −1.6, 0.0 |
| River flow | +0.9 | 0.2, 1.7 |

The fog parts at the same framing, with both tiers' whole-layer delta still
under the noise, were: `maskUnknown` 0.0 (0.8, −0.7), `maskOutOfSight` +1.1
(0.0, 2.1), `warp` +3.1 (1.1, 5.1), `drift` +3.2 (4.6, 1.8), `realmBorders`
+3.7 (3.0, 4.3) and `terrainCull` −0.7 (−1.7, 0.4). Coarse caustics is the
largest water row and realm borders the largest fog row, but their own pairs
disagree by 7.7 ms and 1.3 ms respectively, so neither is resolved.

At world z=0.05 the whole water layer was +80.7 ms (114.6 → 33.9 ms) after a
fresh 1,028 × 688 bake (303.3 ms). Switching its visible effects off hardly
moved the frame: `seaBody` +3.5 (−0.1, 7.0), `shorelineFoam` +2.1 (5.0, −0.8),
`legacyWaveSquiggles` −4.9 (−4.0, −5.9). That is the shape
`docs/design/water-shader.md` predicts: the cost is drawing and blending one
full-viewport water mesh, not the fragment maths inside it. The bake cost is a
worker-side camera-move cost (73.2 / 241.8 / 303.3 ms for the three mask sizes
above), not a per-frame cost.

### Trace and caveats

The 10 s trace recorded 15,494 events: 5,848 `RunTask` (2,651 ms total, max
171.9 ms), 862 `FireAnimationFrame` (1,959 ms total), one long task of 121.9 ms
from the forced rebuilds inside the window, 217 `Commit`, 6 `Paint` (1.3 ms)
and 3 `RasterTask` (1.7 ms). The renderer-process trace does not include the
GPU's shader time; event durations overlap and must not be summed.

Caveats that would change how these numbers are read:

- Dev build, not a production bundle; demo mode's fog mask is generated in
  memory rather than fetched from the API.
- One desktop, one window size, one day's machine load. Compare like with like
  (same viewport, same framing, same settings) before calling a number a
  regression.
- The extra framings' off blocks were single 6 s windows, not repeated
  alternating pairs; treat sub-5 ms deltas there as unresolved.
- No per-effect GPU timing exists, and a full heap snapshot could not be
  exported (over the 5 MiB capture limit), so neither is part of this baseline.
- The older figures in `docs/design/water-shader.md` come from a software
  rasteriser at 1440×900 (~550 ms/frame). They explain why the mesh and the
  river split exist, but are not comparable with the GPU numbers here.

To repeat: start the Vite server, open `/?debug=1`, reach the default
settlement view as above, wait for the bakes to settle, then read
`__fogPerf`/`__waterPerf` and click **Measure breakdown** in the water perf
panel (or call `sampleFrames`/`runPerfSweep` from the console). For the other
framings, zoom with `zoomBy` (or load a camera hash such as
`#world&q=61&r=-2&z=0.22`) and wait for the new water bake before sampling.
Keep the camera still during a sweep, report the MAD and baseline drift with
every result, and say whether the pacer was attached.

## Possible next steps

- A small showcase thumbnail atlas (one camera, 200 × 300) for in-game UI,
  keeping the full-size showcase for docs pages and a lightbox.
- Split the giant volcano's lava faces into their own meshes so its frames
  become parts-only too.
- GPU-compressed textures (KTX2/Basis) would cut the decoded size itself
  (roughly 4–8×), at the cost of a transcoder and some quality; not started.

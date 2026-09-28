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
phone. It is on the player's own profile page, under Graphics, next to a
line saying what it currently resolves to and why.

| Setting | Result |
| --- | --- |
| **Auto** (default) | Off at first. Enabled only once the map has run at ≥ 55 fps for 30 s *without* animations. Turned off again if it then drops below 30 fps for 5 s, and stays off for the rest of the page session. Off outright under reduced motion or data saver. |
| **On** | Always on, on this device, even with reduced motion or data saver: the player chose it explicitly. |
| **Off** | Always off. |

Why these rules:

- **Measure without animations first.** The question auto answers is "can
  this device afford 304 MiB more and the per-frame clip updates?". A device
  that barely holds 55 fps on the static map can't, so it never starts
  loading them.
- **30 s sustained, averaged over 1 s buckets.** One long frame (a GC, a
  rebuild after a pan) is not the device being slow, so single hitches don't
  restart the window; a second that averages under 55 fps does.
- **Latch off.** Animations themselves cost frames. Without the latch, a
  device on the edge would load them, drop below 30, unload, recover, load
  again, and pay the download and decode each time.
- **Measured on the map, in both modes.** The renderer feeds the governor
  every Pixi tick (`animationPreference.feedFrame`), on the world map as well
  as in a settlement: it is judging the device's general frame cost, so a
  session that starts on the world map arrives at its first settlement with
  the measurement already under way.
- **Reduced motion and data saver** (`prefers-reduced-motion: reduce`,
  `navigator.connection.saveData`) mean no animations and no anim download
  in auto. The profile page shows which one is why.

Turning animations off (by setting, or auto dropping them) releases the
anim pages' textures (`unloadAtlasCategory`, `Assets.unload`), so the memory
really comes back rather than just stopping playback. The code is in
`src/frontend/src/lib/perf/animationPreference.ts` (setting, governor,
resolution), `HexMapRenderer.setAnimationsEnabled`/`syncAnimationAtlases`
(load and unload) and `components/settings/AnimationPreferences.vue` (the
profile section).

Docs pages (the tile docs, the wasted lands page) play their own clips with
`useAnimationClock`: frozen under Off, and under reduced motion unless the
setting is On. They don't run the fps governor.

## Hidden tabs

The Pixi ticker stops when the tab is hidden (`document.hidden`) and starts
again when it is visible, so a background tab doesn't render, advance clips
or rebuild. A tab that is visible but not focused (another window in front,
a second monitor) keeps rendering and animating: that is a player watching
the map.

The fps governor ignores frames while hidden and restarts its current
window when the tab comes back, so neither the throttled frames a browser
gives background tabs nor the long first frame after returning count
against the device.

## Compression on the wire

The WebP pages are already compressed; gzip does nothing for them. The JSON
manifests are highly compressible (`buildings-anim-0.json`: 137 KB → 8 KB
gzipped), and the API serves the built frontend through `MapStaticAssets`,
which precompresses static assets with gzip and brotli at publish time
(`deploy/Dockerfile` copies `dist/` into `wwwroot` before `dotnet publish`
for exactly this reason).

## Possible next steps

- A small showcase thumbnail atlas (one camera, 200 × 300) for in-game UI,
  keeping the full-size showcase for docs pages and a lightbox.
- Split the giant volcano's lava faces into their own meshes so its frames
  become parts-only too.
- GPU-compressed textures (KTX2/Basis) would cut the decoded size itself
  (roughly 4–8×), at the cost of a transcoder and some quality; not started.

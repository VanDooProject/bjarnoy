# Legacy: `browsergame` (2018–2019)

Source: `legacy/browsergame/`

A monolithic browser game built as a learning project. Stack: ASP.Net Core 2.2 + MongoDB backend, Vue.js + jQuery + Bootstrap frontend, deployed via Docker and a GitLab CI pipeline.

---

## What is implemented

### Backend (C# / ASP.Net Core 2.2)

**Tech stack**
- ASP.Net Core 2.2 REST API (hosted with Kestrel)
- MongoDB as the database (via `MongoDBRef` for cross-document references)
- SignalR for WebSocket push (queue completion events)
- log4net for logging
- RabbitMQ planned but not implemented

**Domain models**

| Model | Fields |
|---|---|
| `UserModel` | Username, Password, Email (bcrypt assumed) |
| `Player` | EntityResources, Permissions (`guest/player/admin`) |
| `MinimalPlayer` | DisplayName (embedded on tiles/queues) |
| `Island` | name, size, bioms, StartPosition, Tiles (hex grid) |
| `Tile` | Position (HexCoord), Orientation (N/E/S/W), Building, Owner (MinimalPlayer), IslandId |
| `Building` (abstract) | Level, type |
| `ResourceBuilding` (abstract) | gatherRate (Resources) |
| `Lumberjack` | extends ResourceBuilding |
| `StorageHouse` | StorageCapacity (Resources) |
| `Tower` | RangeOfInfluence |
| `Resources` | wood, stone, iron, gold (all double) |
| `EntityResources` | HourlyResourceProduction, ResourceStoredAtLastCalculation, ResourceStorageCapacity, LastResourceStorageRefresh |
| `Technology` | ResourcesNeeded, ResearchDuration, requirements |
| `BuildTechnology` | AllowedTiles, Building |
| `BuildingQueue` | Tile, Building, Owner, StartTime, EndTime, Processing state |
| `Queue` | abstract base: Owner, Target, StartTime, EndTime, eQueueProcessingState |

**Map generation**
- Islands are procedurally generated via `MapCreatorHelper` with a seeded `Random`
- Islands have a `size` and a `seed`; tiles are placed using hex coordinates
- Collision detection between islands: overlapping islands are shifted until clear
- Biomes drive tile-type probability: `GrasslandBiom`, `ForestBiom`, `MountainBiom`, `SparseBiom`, `EdgeBiom`
- Tile types: `GrassTile`, `ForestTile`, `SandTile`, `MountainTile`, `WaterTile`, `CoastalWaterTile`, `PumpkinResourceTile`, `GoldResourceTile`, `StoneResourceTile`, `EdgeTile`, `HalfEdgeTile`, `QuarterEdgeTile`, `TriQuarterEdgeTile`
- Tiles carry a `ResourceContainer` (type, volume, degradation rate) when they are resource tiles

**Building system**
- `BuildHelper` handles the full build pipeline: tech lookup → ownership check → resource check → requirement check → resource deduction → DB write → queue entry
- Race condition protection: resource deduction uses an optimistic concurrency check (`ReplaceAwareOfResources`)
- Build queue items track start/end time and a processing state (`unprocessed`, `processing`, `done`)
- Queue observer pattern: `QueueObserver` watches for completed queue entries and publishes events (→ SignalR)
- Tech tree initializers: `BuildingLumberjackInitializer`, `BuildingStorageHouseInitializer`, `BuildingTowerInitializer` (each specifies resource cost, allowed tile types, required buildings)

**Auth**
- JWT-based authentication; claims include WorldId, WorldName, PlayerId, PlayerName, PlayerPermission
- Sign-up, Sign-in endpoints; world scoped (a user picks a world on login)
- Permission levels: `guest`, `player`, `admin`

**Resource calculation**
- Done client-side in JS each tick; backend provides the snapshot values
- `EntityResources.ResourcesStoredCurrently` is computed as: `stored_at_last_refresh + hourly_rate × hours_elapsed`
- Resources are capped by storage capacity

**API endpoints (inferred from controllers + Postman collection)**
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/signin`
- `GET  /api/v1/auth/selftest`
- `GET  /api/v1/auth/refresh`
- `GET  /api/v1/map/tiles` — island tiles for the logged-in player
- `GET  /api/v1/Resource/user`
- `POST /api/v1/Tech/build` (or similar)
- `GET  /api/v1/Tech/buildings`
- `GET  /api/v1/Queue/my`
- WebSocket hub at `/api/ws` (SignalR) — server pushes `Queue` events

---

### Frontend (Vue.js / Webpack)

**Tech stack**
- Vue.js (single-page application)
- Vuex for state management
- Axios for REST calls
- `@aspnet/signalr` for WebSocket
- SVG-based map rendering
- Webpack with hot-reload

**Components**

| Component | Purpose |
|---|---|
| `map.vue` | SVG canvas; handles mouse/touch pan and pinch-zoom via Vuex mutations; fetches tiles on mount |
| `map_tile.vue` | Single tile rendered as an `<image>` in the SVG; tile type + orientation → image path |
| `menu.vue` / `menu_item.vue` | Building action menu shown on tile click |
| `queue.vue` / `queue_item.vue` | Shows active build queue with countdown timers |
| `resource_display.vue` | Shows current resource stocks + hourly rate, updated every second |
| `gameHeader.vue` | Top bar |
| `zoom_buttons.vue` | +/- zoom buttons (mutate `mapScale`) |
| `login_form.vue` / `register_form.vue` | Auth forms |
| `user_profile.vue` | Player profile display |

**Vuex store**
- State: `mapTiles`, `mapOffset`, `mapScale`, `userResources`, `queued`, `techBildings` (sic — original spelling), `websocket`, `deltaTime`, `now`
- Resource calculation runs client-side every second (`Tick1s`) on the stored snapshot
- Token refresh runs every 60 seconds if the token is past half its lifetime (`Tick60s`)
- WebSocket: on `Queue` event → re-fetch tiles, resources, queues; show browser Notification

**Map rendering**
- Tiles are sorted by `x - y` before rendering (painter's algorithm for isometric depth)
- SVG `viewBox` is updated on pan/zoom; tiles are `<image>` elements at fixed positions
- Isometric tiles use 4-directional orientation (N/E/S/W); coastal water tiles use 6 hex directions
- Tile image naming: `{type}_{orientation}_level{level}.png` (e.g. `lumberjack_E_level001.png`)

**Prototype**
- `Frontend/prototypes/map_canvas.html` — a standalone HTML canvas-based map renderer prototype (predates the Vue component)

---

## Infrastructure

- **Docker Compose**: backend container + MongoDB container
- **GitLab CI**: build → test → deploy pipeline; separate stage files per concern (`build`, `migrations`, `schema`, `test`, `package`)
- **Deployed** to `master.gamez.mynode.space` (historical live demo)

---

## What is missing / not implemented

- Troops / combat system — `Tower.RangeOfInfluence` exists in the model but no combat logic
- Trading — `Queue.Target` field exists ("for trades, attacks") but not wired up
- World map — only island-level view was built; no overworld
- Fog of war — listed in TODO
- Zoom level 2 with higher-res sprites — listed in TODO
- Full rendering of islands (water rendering overlap issue noted in TODO)
- RabbitMQ for multi-instance WebSocket scaling — planned but not implemented
- Round-based game mode — backend game mode switching was listed but not done

---

## Findings from a close read (2026-08, during the backend rewrite)

Details that only surface from reading the source rather than the summary
above. Recorded here so the next person does not have to re-derive them.

### `Island.getNeighbors` returns 8 hexes, not 6

`Models/Map/Island.cs` finds neighbours by walking the 3×3 square of
`(x±1, y±1)` around a hex. On an axial hex lattice that is not the neighbour
set: it returns the 6 true neighbours **plus** two hexes at distance 2 (the
`(+1,+1)` and `(−1,−1)` diagonals). Everything downstream inherits the error —
the coastline pass in `IslandFactoryOrganic.addShallowWater`, the flood fill in
`scanFromTile`, and the `waterTiles == 0` check in `StartPositionHelper`, which
is therefore stricter than intended. `getRange` (used for the distance-2 spacing
check) *is* correct; it uses the proper axial range formula.

### `IslandFactoryOrganic` seeds noise through global static state

`Noise.Seed` is a static property on the `SimplexNoise` package. Two islands
generated concurrently overwrite each other's seed, so generation is neither
reproducible nor parallel-safe. Since the seed is the only thing worth
persisting for a procedurally generated map, this is the blocker for storing a
world as a seed rather than as materialised tiles.

### Map generation writes six PNGs to disk on every call

`GetRndIsland` calls `MapRenderer.GenerateBitmapFromIsland` six times, writing
`map_01.png` … `map_06.png` into the working directory via ImageMagick — one
snapshot per pipeline stage. Useful while tuning the noise thresholds by eye,
but it means the generator does blocking file I/O in whatever request path
calls it, and concurrent calls race on the same filenames.

### The flood fill recurses once per land tile

`scanFromTile` calls itself for each unvisited land neighbour, so recursion
depth is proportional to the size of the landmass. It also does
`tmpIsland.Tiles.Contains(tile)` — a linear scan of a `List<Tile>` — inside that
loop, making the fill O(n²) on top of the stack depth.

### The magic numbers in the terrain thresholds are tied to island size 25

`ConvertRawTileToSpecific` thresholds raw elevation at 105 / 130 / 190 / 230 on
a 0–255 scale, and `GetRawTile` samples noise at frequency `0.08f` with a
comment that `0.01f` is what works for size 100. Two dead locals
(`ElevationFactor`, `HumidityFactor`) compute a size correction that is then
never applied — so the generator only produces sensible islands near size 25,
and the intent to make it size-independent was started and abandoned.

### `Tile.CheckIfSameTile` compares coordinates by distance

Rather than comparing `(q, r)` for equality, tiles are matched with
`HexCoordinates3D.Distance(...) <= Vector3EqualsAllowedDistanceDisturbance`,
a configurable tolerance from settings. That is a float-coordinate workaround
living on integer coordinates; combined with `getTile` doing a linear search
over `Island.Tiles`, tile lookup is both approximate and O(n).

### Resource accrual is already lazy, and that part is right

`EntityResources` stores `ResourceStoredAtLastCalculation`,
`LastResourceStorageRefresh` and `HourlyResourceProduction`, then computes the
current stock on read. No ticking writer, no write amplification, and the game
keeps running while a player is offline. `BuildHelper` pairs it with an
optimistic-concurrency deduction (`ReplaceAwareOfResources`) so two concurrent
builds cannot spend the same wood. This is the strongest design idea in the
project and is worth carrying forward verbatim.

### The tech tree is code, not data

`TechTree/BuildingLumberjackInitializer` and friends each construct one
`BuildTechnology` in C# — cost, build duration, allowed tile types, required
buildings. Adding a building means adding a class and recompiling; balancing
means a deploy. Anything that wants designers (or a round-based mode with
different balance) needs this as data.

### `BiomFactory` is vestigial

`Biom`/`EdgeBiom`/`ForestBiom`/… and `Island.bioms` are still in the model, but
`IslandFactoryOrganic` never uses them — terrain comes entirely from the noise
thresholds. `BiomFactory.GetRndBiomType` also news up a `Random` per call, which
on the old .NET Framework time-seeded RNG returns correlated values in a tight
loop. The biome layer was superseded by the noise generator and left behind.

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

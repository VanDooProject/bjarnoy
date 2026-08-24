# Legacy: `frontend` (2025)

Source: `legacy/frontend/`

A modern Angular SPA started in 2025. Primary focus: a chunk-based SVG hex-map renderer that consumes the `legacy/backend` API. Deployed to Netlify; OpenAPI contract generated from the backend and compiled into TypeScript types.

---

## What is implemented

### Tech stack

- Angular (standalone components, `OnPush` change detection)
- SVG map rendering with `svg-pan-zoom` for smooth pan/zoom
- TypeScript
- Netlify deployment (`netlify.toml`, Terraform config at `terraform/netlify.tf`)
- OpenAPI contract generation via `openapi-typescript` (`npx openapi-typescript`)
- GitLab CI pipeline

---

### Application structure

```
map/src/
├── components/
│   ├── app/          — root component, routing
│   ├── map/          — SVG map canvas, chunk management
│   ├── chunk/        — renders one chunk of tiles as SVG
│   └── tile/         — renders a single hex tile as SVG image
├── pages/components/
│   ├── landingPage/  — placeholder ("landingPage works!")
│   ├── gamePage/     — wraps <app-map>
│   └── editorPage/   — map editor page
├── services/
│   └── map.service.ts — map generation, chunk API
├── models/
│   ├── tile.ts        — Tile, RiverTile, River
│   ├── chunk.ts       — Chunk
│   ├── hexCoord.ts    — HexCoord (axial q/r/s)
│   └── offsetCoord.ts — OffsetCoord (odd-q offset)
└── api/types/
    └── apiSchema.ts   — generated OpenAPI types (not checked in)
```

**Routes**: `/` → landing page, `/game` → game page (map), `/editor` → editor page

---

### Map domain models

**`Tile`**
- Dual coordinates: `OffsetCoord` (odd-q grid x/y) and `HexCoord` (axial q/r/s)
- Fields: `type`, `orientation` (E/NE/NW/SE/SW/W), `level`, `variant`, `color`, `riverTile`
- `RiverTile`: links a tile to a `River` at a position (spring = 0)

**`Chunk`**
- 2D array of tiles, identified by axial coordinates (s, r)
- `size` and `tile_length` for bounds

**`HexCoord`** / **`OffsetCoord`**
- Conversion: `OffsetCoord.oddQToAxial()` ↔ `HexCoord.axialToOddQ()`

---

### Map service (`map.service.ts`)

Generates a procedural hex map entirely in the frontend (no backend required for the demo).

**Tile types used**
```
grasstile, foresttile,
fishinghutbuilding, vikinghut, farm_crop, farm_pumpkin
```
(watertile, coastalwatertile, sandtile, mountaintile commented out)

**Orientations**: `E`, `NE`, `NW`, `SE`, `SW`, `W`

**Map dimensions**: 60 × 60 grid (indices −20 to +60)

**Generation steps**
1. Fill grid with `Tile` objects; assign random orientation and optional random `color` (1-in-12 chance)
2. `generateMap()` — rule-based tile type assignment using neighbor analysis
3. `calculateMapHexCoord()` — convert all offset coordinates to axial hex coordinates

**Chunk API**
- `getChunk(x, y, size): Tile[][]` — returns a slice of the map grid

**Known issue documented in the codebase**
- The recursive `setRandomTileType(x, y)` leads to stack overflows on large maps. An iterative, chunk-based replacement algorithm is designed in `stories/01-MapGen/dynamic-map-generation-architecture.md` but not yet implemented.

---

### Map component (`map.component.ts`)

- Renders tiles dynamically using `ViewContainerRef` (tile components created imperatively)
- `svg-pan-zoom` integration: min zoom `0.015`, max zoom `0.10`, adjusted for device DPI
- `BehaviorSubject` for reactive center position and bounding box
- `OnPush` change detection for performance

**Tile image path convention**: `images/hextiles/{type}_{orientation}.png`

Available hex tile images in `map/public/images/hextiles/`:
```
coastalwatertile, foresttile, grasstile, mountaintile, sandtile, watertile
× orientations: E, NE, NW, SE, SW, W
```

---

### Map generation architecture doc

`stories/01-MapGen/dynamic-map-generation-architecture.md` — design document proposing the iterative chunk-based replacement for the recursive stack-overflow bug. Includes Mermaid flowchart.

---

### API contract

The backend exposes an OpenAPI v1 spec at `https://localhost:7088/openapi/v1.json`.  
The frontend generates TypeScript types from it:

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx openapi-typescript https://localhost:7088/openapi/v1.json \
  -o ./src/api/types/apiSchema.ts --enum
```

---

### Infrastructure

- **Netlify**: static hosting, `netlify.toml` at root
- **Terraform**: `terraform/netlify.tf` manages the Netlify site declaratively
- **GitLab CI**: build + deploy pipeline (`.gitlab-ci.yml`)
- **Git submodules**: `.gitmodules` present (submodule content not in repo)

---

## What is missing / not implemented

- Landing page is a placeholder only
- No authentication UI — no login/register forms; backend auth endpoints exist but are not wired into the frontend
- No actual backend connection for map data — map is generated procedurally in the frontend
- Editor page is a stub
- River / `RiverTile` model exists but rivers are not rendered or generated
- Iterative map generation algorithm designed but not implemented (recursive version has stack-overflow bug on large maps)
- No game mechanics: no resources, no buildings interaction, no combat

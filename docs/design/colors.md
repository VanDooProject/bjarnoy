# Colors

The UI's colors and what each is for. The source of truth for the UI palette is the `:root` block in
`src/frontend/src/style.css`; this doc mirrors it. Change both in the same PR.

Status (2026-11-13): this documents the palette as it is. Many components still hard-code colors instead
of using these tokens; the inventory of those is the "Bjarnøy color inventory" artifact.

## Global tokens (`style.css`)

### Surfaces and text

| Token | Value | Intended use |
|---|---|---|
| `--shell` | `#0b1116` | Page background behind everything (`body`); also the dark ring that separates a badge or avatar from what it sits on. |
| `--panel-bg` | `rgba(10, 20, 27, 0.92)` | Background of floating panels and HUD status cards (`.panel`, `.status-card`). Slightly see-through so the map shows behind. |
| `--panel-border` | `rgba(255, 255, 255, 0.12)` | 1px border and divider lines of panels and cards. |
| `--layer-backdrop` | `rgba(0, 0, 0, 0.6)` | Dims the map behind a layer (HUD drawer, building and training windows) while keeping it readable. |
| `--text` | `#e8f0f5` | Primary text on dark surfaces. |
| `--muted` | `#8fa3af` | Secondary text: labels, counts, hints, captions. |
| `--muted-2` | `#7d909c` | A step below `--muted`: tertiary text and neutral bars in the perf panels. |

### Accent

| Token | Value | Intended use |
|---|---|---|
| `--gold` | `#ffc55c` | The one accent: primary buttons, selected and active states, focus outlines, highlights. Text on a gold fill is dark. |

### Realms

Used for borders, markers and labels that say whose a realm is. Mirrored by hand as numbers in
`src/frontend/src/lib/map/realmColours.ts` for the map renderer; keep both in sync.

| Token | Value | Intended use |
|---|---|---|
| `--realm-own` | `#3f7fe8` | The player's own realm. |
| `--realm-guild` | `#4fd17a` | A realm in the player's guild. |
| `--realm-treaty` | `#9b5cf0` | A realm of a guild with a peace treaty. |
| `--rival` | `#e2705f` | Every other realm; also hostile or blocked things (strong wildlife camps, a build the ring refuses). |
| `--rank-up` | `#4caf6a` | Leaderboard: a rank that moved up. A rank that moved down uses `--rival`. |

### Resources

Lightness steps evenly from brick (darkest) to iron (lightest) so the resources stay apart in greyscale
and for color-blind players; each also has its own pictogram (`ResourceIcon.vue`).

| Token | Value | Intended use |
|---|---|---|
| `--wood` | `#c47a36` | Wood: resource bar, costs, glyphs. |
| `--stone` | `#a84a32` | Brick (the token predates the rename): resource bar, costs, glyphs. |
| `--food` | `#9ed05f` | Food: resource bar, costs, glyphs. |
| `--iron` | `#cbd5dc` | Iron: resource bar, costs, glyphs. |
| `--pop` | `#6fb0e0` | Population: resource bar fill and glyph. |

### Build categories

One tint per build category, shared by the build ring (category and building bubbles) and the docs tech
tree. Lifted so a rim reads on the dark bubble; no two categories share a hue, none is error red.

| Token | Value | Intended use |
|---|---|---|
| `--cat-resource` | `#a8d870` | Resource production buildings. |
| `--cat-military` | `#d3dce2` | Military buildings. |
| `--cat-defense` | `#8fb8d8` | Defense buildings. |
| `--cat-logistics` | `#e88fb4` | Logistics buildings. |
| `--cat-religion` | `#c7aaf0` | Religion buildings. |
| `--cat-water` | `var(--water)` | Water buildings (fishing hut, dockyard). |
| `--water` | `#5aa8c9` | The water build category's blue; read only through `--cat-water`. |
| `--shrine` | `#b391d4` | Meant as the shrine tint in the build ring; nothing reads it at the moment. |

## Colors outside `style.css`

These are not CSS tokens today. Listed so it is clear where they live.

| Where | What |
|---|---|
| `lib/map/realmColours.ts` | Numeric copies of the realm tokens for the Pixi renderer. |
| `lib/map/fogColours.ts` | Fog of war: unexplored fog (`#e9f0f4`, also the settlement canvas background). |
| `lib/map/HexMapRenderer.ts` | Map overlays (hover stroke, army and cart markers, lava, rivers, camp strength) and the flat terrain fallback colors. |
| `lib/map/water/WaterLayer.ts`, `water/riverFlowMesh.ts` | Sea, shallows, foam, caustics, tainted water, river flow. The world map's sea background (`WorldMapCanvas.vue`, `MapView.vue`) repeats the sea colors. |
| `lib/map/bogEdge.ts` | Bog moss, peat and forest ground at bog edges. |
| `lib/map/constructionDial.ts` | Construction dial progress and reject colors. |
| `views/admin/AdminEconomyView.vue`, `AdminPacingBenchView.vue` | Chart series palettes (admin only). |
| `intro/` | The landing story scenes: illustration colors, not UI colors. |

## Known gaps

- `var(--panel, #1c1710)` is read by the docs components and pages, but `--panel` is defined nowhere, so
  they always render the `#1c1710` fallback.

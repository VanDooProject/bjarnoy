# Viking village builder — UI specification

Working design doc: **`Viking Realm UI.dc.html`** (canvas mode, newest round at the top).
Every screen is built from shared tile renderers, one shared palette and one type scale.

---

## 1. Files

| File | Role |
| --- | --- |
| `Viking Realm UI.dc.html` | The design doc. All rounds and options, newest first. |
| `IslandMap.dc.html` | Single-island isometric hex renderer. Used by 1a–1d, 2a, 2b, 4a, 5a, 5c, 5d. |
| `IslandMapWide.dc.html` | Two-island renderer: your realm, a rival realm, ownership outlines, longship + wake. Used by 3b. |
| `VillageBoard.dc.html` | Close-up village board with targeting rings and labels. Used by 8a, 8b, 8c. |
| `tiles/*.png` | Isometric tile art, 200 × 300 px each, transparent. |
| `ios-frame.jsx` | Phone bezel for the mobile cuts. |

### Tile art set
`forest.png`, `farm-crop.png`, `farm-pumpkin.png`, `hut-l2.png`, `hut-l4.png`, `sea-boat.png`, `sea-rock.png`.
Art contains the sprite only — the hex top face and its side are drawn in code, so terrain tone is data-driven.

Superseded: `sand.png`, `water-boat.png`, `water-rock.png` bake a thick prism base into the artwork. `sea-boat.png` / `sea-rock.png` are those two cropped to the hex face; plain sand is drawn in code. Do not reintroduce the baked-base versions.

---

## 2. Hex grid system

Flat-top hexes, odd-column offset (a "pointy-side-out" isometric plate).

| Quantity | `IslandMap` | `IslandMapWide` / `VillageBoard` |
| --- | --- | --- |
| Cell box | 200 × 300 px | 200 × 300 px |
| Column pitch | 150 px | 150 px |
| Row pitch | 100 px (odd cols +50) | 92 px (odd cols +46) |
| Top face | 200 × 100, at y = 140 | 200 × 92, at y = 139 |
| Side (skirt) depth | 28 px | 28 px |
| Stack order | `z-index = round(y × 10 + q)` | same |

**Top face clip**
`polygon(0 50, 50 0, 150 0, 200 50, 150 100, 50 100)` — 92-tall variant swaps 50/100 for 46/92.

**Side clip** (one element, hex-shaped, not two half-parallelograms)
`polygon(0 0, 50 46, 150 46, 200 0, 200 28, 150 74, 50 74, 0 28)`

Rounds 6 and 7 draw the same grid inline as one `<svg>` per hex (two polygons: top face, then side) rather than through a renderer. Geometry is expressed as fractions of the tile width `W`: top-face half-height `0.23W`, face bottom `0.46W`, side depth `0.14W`, vertices at x = 0, 0.25W, 0.75W, W.

> Tiles are **thin plates**, not cubes. A deep two-piece skirt was the cause of the square-block silhouettes under the hexes; both renderers now use the single 28 px hex skirt that `IslandMap` always used.

### Terrain tones — `[top, side]`
| Terrain | `IslandMap` | `IslandMapWide` | `VillageBoard` |
| --- | --- | --- | --- |
| grass | `#7ba844` / `#4e6f2b` | `#5b9128` / `#ae7330` | `#5b9128` / `#ae7330` |
| sand | `#e0c882` / `#b39a58` | `#ddc37e` / `#c7a35c` | `#ddc37e` / `#c7a35c` |
| sea | `#215a7a` / `#143d55` | `#1e5473` / `#17415a` | `#1c3650` / `#14283c` |

Cells carrying `boat` or `rock` art render with no plate at all (open water).

### Ownership outlines (`IslandMapWide`)
Per-hex edge walk: an edge is stroked only where the neighbouring hex has a different owner. Rendered as one SVG path per owner, above all tiles.
- You — solid `rgba(255,197,92,.95)`, 5 px.
- Rival — dashed `14 10`, `rgba(226,112,95,.95)`, 5 px.
- Fleet track — white dotted `3 14`, 4 px, with an inline longship glyph.
- Fog: blurred radial blobs, two elliptical rings around the played area.

### Targeting rings (`VillageBoard`)
A ring is a coloured hex face with a second, inset hex face (10 px inset) in the terrain tone punched over it — a 10 px outline that follows the hex exactly.
Ring colours: `#ffc55c` (act here), `#8fc35a` (grain), `#7fb3d5` (sea).
Labels are pills anchored above the hex centre; gold ring → gold pill with `#20160a` text, otherwise `rgba(8,20,28,.92)` with white text.

---

## 3. Renderer props

**`IslandMap` / `IslandMapWide`** — `w`, `h`, `zoom`, `cx`, `cy` (pan centre in canvas px).
Canvas: 1600 × 900 (`IslandMap`), 2400 × 900 (`IslandMapWide`).

**`VillageBoard`** — `preset` (`shore` | `feast` | `grow`), `zoom` (0.2–1.2, default 0.6), `cx`, `cy`.
Canvas 1400 × 700.
- `shore` — beach, one wall plot, three boats inbound.
- `feast` — three dish targets on the village.
- `grow` — tap targets that yield grain and wood.

---

## 4. Visual language

**Type** — Outfit throughout, except round 9, where each option carries its own face (Instrument Serif / IBM Plex Mono / Archivo) as part of the hook.
| Use | Style |
| --- | --- |
| Round heading | 600 / 26 px, `-0.01em` |
| Round description | 400 / 15 px, `#8fa3af`, max 940 px |
| Option title | 500 / 15 px |
| Option size note | 400 / 13 px, `#7d909c` |
| HUD label | 600 / 13–15 px |
| HUD sub-value | 400 / 12 px, `#8fa3af` |

**Palette**
| Token | Value | Use |
| --- | --- | --- |
| Gold | `#ffc55c` | Primary action, your realm, option badges |
| Rival red | `#e2705f` / `#ff6b5c` | Enemy realm, raid timers |
| Shell | `#0b1116` | Frame background |
| Browser chrome | `#151d24` | Fake window bar |
| Panel | `rgba(10,20,27,.9–.94)` + `1px rgba(255,255,255,.12)` | Every HUD surface |
| Text | `#e8f0f5` | Body |
| Muted | `#8fa3af` / `#7d909c` | Secondary |

**Resource dots** — wood `#c98b4b`, stone `#9aa7ad`, grain `#8fc35a`, silver `#6f8fa8`. Always `value` + `+rate/h`.

**Surfaces** — panels 10–14 px radius, pills 999 px, frames 14 px, phones 44 px. One shadow: `0 30px 80px rgba(0,0,0,.5)`.

**Frames** — web 1440 × 820/900 with a three-dot chrome bar and the URL `fjordhold.game/realm/bjornstad`; mobile 393 × 852 (390 × 844 in round 5).

---

## 5. Screen inventory

### Round 9 — three landing pages that share nothing
Deliberately far apart in hook and optics; each brings its own typeface.
- **9a** The saga page — the world as a printed register · 1440 × 900 · Instrument Serif on `#f4ead7`, oxblood `#8c2f1d`, no map at all
- **9b** The live feed — the sea is already ticking · 1440 × 900 · IBM Plex Mono on `#06090b`, event stream + join-at-next-tick panel
- **9c** The poster — one hex, no interface · 1440 × 900 · Archivo 900 over a full-bleed `VillageBoard` at dusk

### Round 8 — daylight, one clear goal, village on screen
Bright boards, a goal readable in one line, one obvious thing to click. All three use `VillageBoard` on the same grid code as 3b.
- **8a** Three boats, one wall — a defence you can win in one click · 1440 × 900
- **8b** Feast day — the friendly way into the economy · 1440 × 900
- **8c** Tap to grow — visible progress in thirty seconds · 1440 × 900

### Round 7 — three more premises
- **7a** Cast the runes — identity first · 1440 × 900
- **7b** A clan is short one jarl tonight · 1440 × 900
- **7c** Play one turn before you decide · 1440 × 900

### Round 6 — village view, first move is the hook
- **6a** Place a building before you sign up · 1440 × 900
- **6b** Drop into a raid already in progress · 1440 × 900
- **6c** One decision: pick where you land · 1440 × 900

### Round 5 — two more front doors, and phones
- **5a** Homepage — full-bleed world · 1440 × 900
- **5b** Homepage — season clock, no map · 1440 × 900
- **5c** Mobile — map first (4a) · 390 × 844
- **5d** Mobile — full-bleed world (5a) · 390 × 844
- **5e** Mobile — season clock (5b) · 390 × 844

### Round 4 — the front door
- **4a** Homepage — quick start · 1440 × 900. Island already on screen; only a jarl name stands between visitor and first turn.

### Round 3 — hex territories and a wider sea
- **3a** World map — real hex territories · 286 hexes, static SVG
- **3b** Web — wider island, rival realm, fleet at sea · 1440 × 820

### Round 2 — merged HUD and new world maps
- **2a** Web — row menu, no top scrim · 1440 × 820
- **2b** Mobile — edge minimap + progress card
- **2c** World map — territory patchwork (one island, many owners)
- **2d** World map — pins + island roster (terrain stays neutral)

### Round 1 — realm map, HUD explorations
- **1a** Web — corner anchored · 1440 × 820
- **1b** Web — floating pill clusters · 1440 × 820
- **1c** Mobile — minimap as edge tab
- **1d** Mobile — no minimap, compass rail
- **1e** World map — web · 1440 × 820
- **1f** World map — mobile

---

## 6. Content constants

- Your realm: **Bjornstad**, jarl "you", Lv 4, 1 of 3 settlements.
- Rival realm: **Grimhold**, jarl Ulf, Lv 6.
- Fleet: longship **Sea-Wolf**, settler crew, landfall 00:38:20.
- Sea: **Kettil Sea**.
- Standing HUD resources: 4 820 (+240/h), 2 105 (+90/h), 9 340 (+615/h), 760 (+35/h).
- Raid timer: 04:12.
- Longhouse Lv 4 — claims 12 hexes, +2 build slots at Lv 5, upgrade 02:41:08.

---

## 7. Conventions

- Options are grouped one `<section>` per round, newest at the top; each option carries a stable `{turn}{letter}` id shown as a gold badge, and every reference in the doc is an anchor link to it.
- New rounds are inserted above existing ones; earlier rounds are left untouched.
- All styling is inline. No stylesheets, no classes.

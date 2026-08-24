# Design brainstorms from Claude Design (zip files)

Three zip archives were attached to [issue #1](https://github.com/VanDooProject/bjarnoy/issues/1) by the project owner. They contain AI-generated UI mockups and design brainstorms for the game, each with its own README/notes.

> **Note:** The zip archives themselves are **not** in the repository (excluded via `.gitignore`). This document summarises the focus of each zip as described in the issue. When the HTML prototypes are extracted from the zips, they should be placed in `prototypes/` (filenames suggested below).

---

## Zip 7 — World-map view

**File:** `Viking Browser Game UI (7).zip`

Focus: the **world map** — the high-level sea view showing islands, territories, and fleet movements. This is the "zoomed out" abstraction of the island/village view described in the game mechanics.

Key design concepts extracted:
- Islands rendered as blobs of colour on a sea background
- Territory shown as coloured outlines (per player/clan)
- Fleet tracks visible on the map with ETAs
- Smooth zoom transition from world map → island view (same renderer, different zoom level)
- Settlement indicators (icons/markers) on each island showing player presence

can be found in: `prototypes\worldmap`

---

## Zip 4 — Landing page concepts

**File:** `Viking village builder game (4).zip`

Focus: **landing page / onboarding** — multiple pages and brainstorms for how to hook players directly into the game without a traditional registration wall.

Key design concepts extracted:
- World view is already on screen and moving when the page loads
- First interaction is a real game move (place a building, pick a plot, drop a wall)
- Account creation is deferred until the player has something worth naming
- Multiple distinct page layouts / onboarding flows are included

Suggested prototype file: `prototypes\landing_pages`

---

## Zip 9 — Fog of war and settlement view

**File:** `Viking Browser Game UI (9).zip`

Focus: the **fog of war** mechanic and the **settlement / village view** — the zoomed-in view of a player's hex tiles, buildings, and contested borders.

Key design concepts extracted:
- Fog of war: unexplored hexes are hidden; scouted but not currently-visible hexes are greyed out
- Settlement view shows individual building sprites on hex tiles
- Border hexes show contested state (two-colour outline) when two players' claims meet
- Raid inbound warning overlaid on the map (`Raid inbound 04:12`)
- Garrison and wall placement on specific border hexes

can be found in: `prototypes\village_view`

---

## Game mechanics extracted from the design files

The mechanics described in the README files inside the zips are consolidated in:

→ **`prototypes/MECHANICS.md`** (already in the repo)

That document covers: territory/borders (Settlers II style), settlements, colonisation, the unified map+village view, real-time resource rates, buildings, conflict, and onboarding philosophy.



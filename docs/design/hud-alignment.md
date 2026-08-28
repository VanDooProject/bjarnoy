# HUD alignment with design ideas

Design doc for [issue #16](https://github.com/VanDooProject/bjarnoy/issues/16). For each of the six sections in
the issue: the current state before this pass, the reference image, the concrete decisions made, which files
implement it, and — honestly — what could and couldn't be verified visually in this environment.

All seven reference images below are embedded from the issue's own `github.com/user-attachments/assets/...`
URLs (re-fetched from the live issue body, not guessed), so they render when this doc is viewed on GitHub.
Five of the seven could be viewed directly while working on this issue; the two "status box" images could
not be fetched as pixels in this sandbox (the CDN returned 403 to an anonymous `curl`, and they weren't
attached as viewable images either). The project owner supplied a precise written description of both after
the fact, quoted verbatim in that section below and used as the authoritative spec instead of a guess.

Screenshots of the actual running app (before/after, where relevant) live in `docs/design/img/` and are linked
throughout. They were taken with Playwright against `npm run dev` in demo mode (chromium, 1400×900); the
world-map island-gold change is the one exception — see its section for why.

---

## 1. Header

**Target:**

![header reference](https://github.com/user-attachments/assets/3697ddaa-d56a-4976-8678-03ed4407b948)

**Current state before this pass:** three separate floating pieces — `TopBar.vue` (a plain text wordmark
"Fjørdhold", the game's old placeholder name, plus the player's nickname pill), `ResourceBar.vue` (four
resource pills with round dot icons, no population), and `HudNav.vue` (Settlement/World map/Landing pills,
no avatar). `TopBar`/`HudNav`/`ResourceBar` were already mounted in **both** `SettlementView.vue` and
`WorldMapView.vue`, so "shown in settlement and worldmap view" was already true structurally — the header's
*content* was what needed to change, not where it renders.

**Decisions:**

- **Logo:** a yellow hex badge (inline SVG hexagon, gold fill) next to the wordmark, which now reads
  "BJARNOY" — the game's actual name — instead of "Fjørdhold".
- **Subheadline:** the current settlement's name (`world.hud.settlementName`), replacing the player nickname
  line.
- **Resource icons:** redrawn as hexes (a `<span>` with a CSS `clip-path` hexagon) instead of round dots/diamonds.
- **Population:** added as a fifth resource pill, wired the *same way* as the other four (current/max stock +
  an hourly rate). This required real plumbing: neither the backend (`Bjarnoy.Domain`) nor the legacy game
  models a population field anywhere — it's entirely absent, as the issue anticipated ("check backend/shared
  model for a population field or add minimal plumbing if entirely absent"). Standing up a real backend
  population system (housing capacity, worker assignment, growth ticks) is out of scope for a HUD-alignment
  pass, so `WorldModel.populationFor()` derives a plausible current/max/rate purely client-side from inputs
  the model already has — longhouse level and building count (the same inputs `countBuildings` already used
  for onboarding). This is a deliberate scope decision, called out in the code comment on `populationFor` and
  here: it makes the HUD honest about *displaying* population like every other resource, without pretending a
  full population *system* exists yet.
- **Nav / avatar:** `HudNav` gained disabled "Reports" and "Alliance" placeholders (visually matching
  "WORLD MAP / REPORTS / ALLIANCE") and a round avatar badge with the player's initials, replacing the old
  nickname pill. Reports/Alliance are deliberately non-functional (`disabled`, tooltip "Not implemented
  yet") rather than linking to a page that doesn't exist.

**Files:** `components/hud/TopBar.vue`, `components/hud/ResourceBar.vue`, `components/hud/HudNav.vue`,
`lib/map/WorldModel.ts` (`populationFor`), `stores/world.ts` (`hud.population`), `lib/map/types.ts`
(`Settlement.islandId`, used later in section 6 but plumbed in the same commit as the rest of the store
wiring).

**Correction after review:** the first pass built the logo/titles, the resource pills, and the nav as three
*independently* absolutely-positioned floating panels (`TopBar` top-left, `ResourceBar` top-right at
`top: 66px`, `HudNav` top-right at `top: 16px`) rather than one cohesive strip — despite the doc above
claiming it was "verified... end-to-end", no screenshot was actually taken to check that claim, and the
result did not read as the single bar the reference shows. Fixed by turning `TopBar` into the outer bar
(a full-width flex row with its own background/border, `pointer-events: none` so the map underneath stays
clickable except through its own buttons) and making `ResourceBar`/`HudNav` render as normal flex children
inside a `<slot>`, instead of each drawing its own floating `panel`. `SettlementView`/`WorldMapView`/
`LandingView` now compose `<TopBar><ResourceBar /><HudNav /></TopBar>` (Landing omits `ResourceBar`, matching
its pre-founding state). `HudNav`'s pills were also restyled to plain uppercase text links with dividers
(matching the reference's understated nav, not filled pill buttons).

**Storage cap + fill bar:** the reference also shows a max/cap and a fill-progress underline for each of the
four base resources (e.g. "4,965 / 12,000"). No storage-cap field exists anywhere in the data model
(`Resources`, `Settlement`, the backend) for wood/stone/food/iron — only population had a real `max`. Rather
than leave the pills capless, `WorldModel.storageCapFor()` derives a per-resource cap the same way
`populationFor` derives population — client-side, from the longhouse level, with a different base per
resource (wood/stone/food/iron aren't all the same number in the reference either) so the caps read as
varied rather than one flat value repeated four times. `stores/world.ts`'s `syncHud()` now sets
`hud.storageCap` alongside `hud.resources`/`hud.rates`, and `ResourceBar` renders `current/cap` plus a
thin fill-percentage bar under every pill (population included, reusing its already-real `max`). Same
scope caveat as population: this is a *display* value, not a real storage-capacity system (a warehouse
building that actually raises the cap, for instance, does not exist yet).

**Verified:** yes — see the screenshot below, taken after the fix, in both views.

![settlement view with the unified header bar](img/settlement_full_hud.png)
*(settlement view — one continuous bar: hex logo, settlement name + island/longhouse caption, resource pills, nav, avatar)*

![world map view with the same header bar](img/worldmap_header.png)
*(world map view — same bar, confirming "shown in settlement and worldmap view")*

---

## 2. Ring menu on click of tile

**Target:**

![ring menu reference](https://github.com/user-attachments/assets/3690f0be-5a0c-489e-8828-16f61ce2a24b)

**Current state before this pass:** `SettlementView.vue`'s `onHexClick` always opened `BuildingModal.vue`
directly — a full-screen detail sheet — for every click, regardless of what was clicked. There was no radial
menu and no per-tile-state branching.

**Decisions:** `onHexClick` now opens a new `RingMenu.vue` component instead, with the action set depending on
the tile:

| Tile state | Actions |
|---|---|
| Own empty tile | Details, Build (→ outer ring of categories → outer ring of buildings) |
| Own building | Upgrade, Raze (tear down), Details |
| Enemy-owned tile | Info, Attack/Raid (**disabled** — no combat system exists) |
| Unclaimed hex | Info, Send settlers / Land here (**disabled** — no settler mechanic exists yet) |

"Details"/"Info" hands off to the existing `BuildingModal`, unchanged. "Build" opens a second-level ring of
categories, then a third-level ring of concrete buildings — grass gets three categories (Housing/Resource/
Defense) each with one real building (Hut/Farm/Watchtower), matching "on grass it should have multiple build
categories/entries"; other buildable terrain gets a single "Build" category listing the same three buildings,
since the issue calls out grass specifically as the multi-category case. Building-specific actions
(train/research) are structured for in the code (a comment marks where they'd plug in) but none of today's
building types (hut/farm/tower/longhouse) expose one, so nothing renders there yet — there's simply nothing
to train or research with the current building catalogue.

"Raze" is demo-mode only: the backend has no tear-down endpoint (`Bjarnoy.Domain.Buildings`), so it's disabled
in live mode with a hint rather than silently no-op'ing. `WorldModel.razeBuilding()` handles the demo-mode
case (clears the building, keeps the hex claimed; refuses to raze a longhouse).

The ring itself (`RingMenu.vue`) is generic — it takes an `actions: RingAction[]` array and lays bubbles out
in a circle (an X shape for exactly 4 actions, evenly spread otherwise), so it isn't hard-coded to any one
tile state.

**Files:** `components/hud/RingMenu.vue` (new), `views/SettlementView.vue` (ring state machine + action
tables), `lib/map/WorldModel.ts` (`razeBuilding`), `lib/map/HexMapRenderer.ts` (`onHexClick` now also reports
the tile's screen anchor point so the ring can center on it), `components/map/SettlementCanvas.vue` /
`WorldMapCanvas.vue` (updated emit signature).

**Verified:** yes, end-to-end with Playwright — founded a settlement, clicked an empty own tile, drilled
Build → Housing → Hut, and confirmed the hut was actually placed (the population pill moved from 22/40 to
26/45, proving the build order went through the same code path as before).

![ring menu root actions on an empty tile](img/ring_menu_root.png)
![build category ring on grass](img/ring_menu_build_categories.png)

The enemy-tile/unclaimed-hex/own-building branches were verified by code review rather than a screenshot each
(demo mode's single-player world has no rival settlements to click on without a lot of extra scaffolding) —
the logic is a straightforward computed `switch` in `SettlementView.vue` (`ringActions`), not something that
needed a live render to sanity-check.

---

## 3. Better hover

**Target:**

![hover reference](https://github.com/user-attachments/assets/18daeaa1-6479-48d4-b81a-06f35392438a)

**Current state before this pass:** `HexTooltip.vue` showed title / subtitle / one stat line, in a rounded
`.panel` card.

**Decisions:** the tooltip is square-cornered now (`border-radius: 0`, overridden locally rather than on the
shared `.panel` class so other HUD chrome is unaffected), and buildings get a richer card: title + "LEVEL n",
an output rate, an optional modifier line (irrigation for a farm, "Border anchor" for a watchtower), a worker
count, and a "CLICK TO OPEN" cta for buildings the player owns — matching the mockup's "Crop farm LEVEL 2 /
Output +240 food/h / Irrigated yes (+10%) / Workers 8/8 / CLICK TO OPEN" shape. None of output/modifier/worker
data is tracked per-building anywhere in the real model (`WorldModel`/backend only know a settlement's
*aggregate* rates, not what one specific hut or farm produces), so `HexMapRenderer.buildingStats()` derives
these deterministically from the building's type, level, and whether a neighbouring hex is shore/water — this
is documented as illustrative-for-display on `HoverInfo`'s doc comment, the same honest-scoping approach used
elsewhere in this codebase (see the existing "demo mode has no backend queue" comment in `BuildQueuePanel.vue`
as a precedent).

**Files:** `lib/map/HexMapRenderer.ts` (`HoverInfo` interface, `hoverInfoFor`, new `buildingStats`),
`components/hud/HexTooltip.vue`.

**Verified:** yes.

![hover tooltip on a hut](img/hex_hover_tooltip.png)

---

## 4. Settlement badge

**Target:**

![settlement badge reference](https://github.com/user-attachments/assets/381a0e29-6fba-4176-9421-2b8170dc23c7)

**Current state before this pass:** `HexMapRenderer.rebuildSettlementLabels()` already drew a floating pill
above the longhouse hex with a dot + the settlement's name — just the name, no level or ownership indicator.

**Decisions:** the label text now reads `"<name>  you · Lv <n>"` for the player's own settlement, and
`"<name> · Lv <n>"` for a rival's — matching "Bjornstad  you · Lv 4" from the mockup exactly. One-line change
(`rebuildSettlementLabels`'s label-text assignment); the existing dot-color/pill-box code (already
gold-for-mine, a rival color otherwise) needed no changes.

**Files:** `lib/map/HexMapRenderer.ts` (`rebuildSettlementLabels`).

**Verified:** yes.

![settlement badge reading "Unnamed realm you · Lv 1"](img/settlement_badge.png)

---

## 5. Status box (left side)

The issue's two reference images for this section (a "buildings in queue" panel described as "the optical
guide", and an "others" panel for raid/settler-voyage content "just for the sharper-edges styling, not for
optical stuff") could not be fetched as pixels while exploring the issue — `github.com/user-attachments`
returned 403 to an anonymous `curl` from this sandbox, and they weren't supplied as viewable images either.
The project owner then supplied an exact written description of both, which is quoted here verbatim and used
as the authoritative spec (superseding any earlier guess) rather than working from the vaguer "sharp corners,
clickable rows" summary in the issue body alone:

> **IMAGE A — "Construction" panel (buildings-in-progress, the "optical guide" one):**
> Dark navy card, sharp/square corners, no border radius. Header row: label "CONSTRUCTION" (bold,
> letter-spaced/uppercase, white) on the left, "2 / 3 slots" (dim gray) right-aligned — used/total slot count.
> Thin divider under the header. Then queued items, each row: bold white title "Watchtower → 3" (name → target
> level) with a countdown right-aligned in orange/amber ("17:00"); directly below, a thin progress bar, orange
> fill roughly proportional to completion (first item ~70% filled); below that, a small dim gray subtext line
> giving the tile + a short note ("hex 4-5 — border anchor"). Second row: "Crop farm → 3", "05:40", ~15%
> filled, "hex 4-4 — irrigated". Rows stack with modest spacing, no dividers between rows.
>
> **IMAGE B — three stacked status cards ("others"; content illustrative only, but the sharp-corner styling
> and color-coding pattern should be reused):**
> 1. "BUILD QUEUE" (same navy style): header "BUILD QUEUE" / "2/2". "Longhouse → 5", "21:45" orange, ~80%
>    orange bar. "Watchtower → 2", "0:00" — bar is **blue** and full, i.e. a build essentially complete
>    switches its bar from orange (in-progress) to blue (done/finishing), not a stale orange bar.
> 2. "INCOMING RAID" — dark maroon/red-tinted background (not navy), header "INCOMING RAID" in orange/amber
>    uppercase, countdown "0:00" in orange. Body: bold white "Steinarr of Draugrey · 2 longships", dim gray
>    "Landing on the east shore of Hafrsey". Red tint signals danger/urgency.
> 3. "SETTLER VOYAGE" — dark navy/blue-gray background, header "SETTLER VOYAGE", countdown "4:57:13" in
>    cyan/light-blue. Body: "Hafrsey → Vestrey · 3rd settlement".
> Cards stack vertically with a visible gap between each, each independently sharp-cornered.
>
> Reusable pattern: sharp corners, a header row (uppercase label left, count/countdown right, color-coded
> per card type — neutral/orange for construction & build queue, red/maroon for threats, blue/cyan for
> voyages/travel), an optional progress bar under a titled row, and a dim gray subtext line.

**Decisions:** `BuildQueuePanel.vue` was rebuilt to Image A's spec exactly: sharp corners, "CONSTRUCTION"
header with a slot count (`X / TOTAL_SLOTS` — `TOTAL_SLOTS` is a constant 3, since no backend concept of "how
many build slots does this settlement have" exists either), bold title + orange countdown per row, a thin
progress bar that's orange while in progress and switches to blue once a row's remaining time is essentially
zero (Image B's "0:00 → blue bar" rule), and a dim "hex q-r" subtext line. The CSS is written as a small
reusable convention (`.status-card` / `.status-card-header` / `.status-row` / `.status-progress`, documented
in a comment) so a future raid card (red/maroon variant) or settler-voyage card (blue/cyan variant, per Image
B) can reuse the same classes with a different accent color — neither is wired to real data now, since
neither raids nor settler voyages exist as game mechanics yet; only the construction panel has real data to
show.

**Percent-complete honesty note:** neither the backend's `BuildOrder` nor the HUD's snapshot of it records
*when* an order started — only how many seconds are left as of the last poll. So "percent complete" is only
ever an approximation here: it's derived from the remaining time *at the moment the HUD last fetched it*,
treated as a stand-in for the order's total duration. This reads correctly for an order that started around
the last poll, and undercounts one that was already well underway before that. This is documented in the code
(`orders` computed in `BuildQueuePanel.vue`) rather than silently presented as an exact number — getting an
exact percentage would need the backend to start recording an order's start time, which is backend scope
beyond this HUD pass.

**Click-to-center-and-flash:** clicking a queued row now emits `select`, which `SettlementView.vue` wires to
`HexMapRenderer.panTo()` (recentres the camera) plus a new `setHighlight()` call that flashes the renderer's
*existing* pulsing gold highlight outline (`drawHighlight`, already redrawn every tick) for about two seconds.
`setHighlight` is a new, narrow method rather than reusing the existing `updateOptions()` — `updateOptions`
unconditionally re-snaps the camera back to the settlement's origin once a settlement is already founded (by
design, for a different use case: the landing page's founding transition), which was silently cancelling out
the `panTo` call made just before it. This was caught by testing the interaction, not just reading the code —
see below.

**Files:** `components/hud/BuildQueuePanel.vue` (rewritten), `views/SettlementView.vue` (`onQueueSelect`),
`lib/map/HexMapRenderer.ts` (`setHighlight`).

**Verified:** the card's visual layout and the click→pan→flash interaction were both verified against the
running app — but only with a temporary in-memory fake queue (three entries, one already at 0:00), since demo
mode never populates a real build queue at all (buildings there place instantly — see the panel's own
long-standing top-of-file comment) and standing up the live backend was out of scope for this pass. The fake
data was injected directly into the pinia store for the screenshot, then fully reverted before committing —
it is not part of the committed diff.

![CONSTRUCTION status card](img/status_box_construction.png)

Clicking the "Watchtower" row visibly recentred the camera on hex 4,5 (confirmed by the terrain shifting in
the screenshot) — the fix for the `updateOptions`-cancels-`panTo` bug above was validated this way, not just
by reading the code.

---

## 6. Map island names

**Target:**

![world map island names reference](https://github.com/user-attachments/assets/a1fc86d9-7725-42a1-b05c-7994ff2d5436)

**Current state before this pass:** `HexMapRenderer.rebuildMarkers()`'s world-mode island loop drew every
island name in the same neutral color (`0xe8f0f5`), regardless of who (if anyone) had settled there.

**Decisions:** the island the current player has settled on now renders its name in gold and bold; every
other island's name stays neutral. This needed one piece of plumbing that was entirely missing:
`Settlement` (`lib/map/types.ts`) gained an optional `islandId` field, populated from the backend's
`SettlementResponse.islandId` wherever a settlement is registered from a live-mode API response
(`stores/world.ts`: `foundStartingSettlementLive`, `restoreLiveSettlement`). The renderer then finds the
player's own settlement, reads its `islandId`, and compares that against each `IslandLabel.id` it's drawing.

**Files:** `lib/map/types.ts` (`Settlement.islandId`), `stores/world.ts` (plumbing), `lib/map/HexMapRenderer.ts`
(`rebuildMarkers`'s island-label loop).

**Correction after review:** the gold/bold comparison logic was correct, but it was applied to the *existing*
label styling untouched — default fill `0xe8f0f5` (near-white) at `fontSize: 11`, no letter-spacing, no
uppercasing. Against the reference's muted-gray, letter-spaced, uppercase small-caps look, that read as "not
really like the reference" even where the gold/non-gold logic itself was right. It also wasn't screenshotted
at all in the first pass — the doc said so honestly, but a passing claim on an unverified path is still a
process bug worth naming.

Fixed the styling itself: island names now render `island.name.toUpperCase()`, `letterSpacing: 1.5`,
`fontSize: 13`, muted gray (`0x8fa3af`, matching the HUD's own `--muted` token) for other islands, gold+bold
for the player's own — while resetting those same properties (`fontWeight`, `fontSize`, `letterSpacing`)
explicitly on the other two label types sharing the same `Text` object pool (`ownerLabel`, fleet-ETA labels)
so a pooled instance recycled across frames for a different label type can't inherit a stray letter-spacing
value left over from an island label.

Also fixed the label's *position*: it was anchored above the island's centre (`anchor(0.5, 1)`, offset
upward), which draws it over the island's own hexes rather than below the island's footprint, as every
island in the reference shows it. Anchor flipped to the label's top edge (`anchor(0.5, 0)`) and the offset
now pushes it down past the island (`center.y + TILE_H * 1.1 * zoom`) instead of up into it.

**Verified:** demo mode's `WorldModel` still never calls `setIslands()` (only `bootstrapLiveWorld()` does,
live-mode only), so the gold/non-gold *comparison* itself still can't be exercised against the real backend
in this environment. To at least verify the *rendering* (not the data plumbing) without standing up the
.NET backend, the running demo-mode app's debug hook (`window.__demoWorld()`) was used to inject a stub
`islandId` on the player's own settlement and three fake `IslandLabel`s via `WorldModel.setIslands()`,
matching the reference's island names (Steinsey / Draugrsker / Kaldøy) — see screenshot below. This confirms
the label now actually looks like the reference (uppercase, letter-spaced, gold+bold for the owned island);
it does not confirm the live-mode `islandId` wiring end-to-end, which still needs a session with the real
backend running.

![world map island name in gold, demo-mode stub](img/worldmap_island_gold_demo_stub.png)
*("KALDØY" forced via the debug hook to carry the player's `islandId` — confirms the label styling, not the live-mode data plumbing*

---

## Summary of files touched

- `components/hud/TopBar.vue`, `ResourceBar.vue`, `HudNav.vue` — header (§1)
- `components/hud/RingMenu.vue` (new) — ring menu (§2)
- `components/hud/HexTooltip.vue` — hover (§3)
- `components/hud/BuildQueuePanel.vue` — status box (§5)
- `views/SettlementView.vue` — ring-menu wiring, build-queue click-to-flash
- `lib/map/HexMapRenderer.ts` — `HoverInfo`/`buildingStats` (§3), settlement badge text (§4), `setHighlight`
  (§5), island gold-highlight (§6), `onHexClick` screen-anchor plumbing (§2)
- `lib/map/WorldModel.ts` — `populationFor` (§1), `razeBuilding` (§2)
- `lib/map/types.ts` — `Settlement.islandId` (§6)
- `stores/world.ts` — `hud.population` (§1), `islandId` plumbing (§6)
- `components/map/SettlementCanvas.vue`, `WorldMapCanvas.vue` — updated `hex-click` emit signature (§2)

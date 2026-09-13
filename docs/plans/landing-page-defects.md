# Landing page defects — implementation brief

Triaged from a live-mode (`VITE_DEMO_MODE=false`) session against a real
backend. Every finding below is traced to code; where a symptom has more than
one plausible trigger that is called out explicitly.

Reference mockup for the pre-founding screen: `docs/design/img/but_building_on_map.png`
("6a — Place a building before you sign up"). It is the source of truth for
the header, the framing and the hero's sub-line, and several findings below
are simply "the implementation drifted from it".

Each item is independently implementable. Suggested order is L7 → L6 → L5 →
L4 → L3 → L2 → L1, because L7/L6 fix a state the page cannot recover from at
all, and L4/L5 change the camera framing that two test helpers currently
hardcode (see "Test debt" at the end).

---

## L1 — The landing header is the full in-game HUD nav

**Symptom.** The top bar shows `WORLD MAP · LEADERBOARDS · REPORTS ·
ALLIANCE · DOCS · LANDING`, a locale switcher and an avatar, to a visitor who
has not founded anything.

**Reference.** The mockup's landing header is a hex logo + the wordmark
"Bjarnoy" on the left and a single **"I already have a realm"** link on the
right. Nothing else. `docs/design/zip-brainstorms.md:44` states the rule the
current header breaks: account creation and player-to-player surfaces are
deferred until the player has something worth naming.

**Root cause.** `src/frontend/src/views/LandingView.vue:585-587` mounts the
shared `<TopBar><HudNav /></TopBar>` unconditionally — the same nav the
settlement and world views use. `HudNav.vue` has no pre-founding variant.

**Two of those links are dead ends, not just noise:**
- `WORLD MAP` → `/world`, which `src/frontend/src/router/index.ts:200-202`
  bounces straight back to `/` while `player.hasFoundedSettlement` is false.
  The visitor clicks it and nothing happens.
- `LANDING` → `/`, a self-link on the page you are already on.
- `REPORTS`, `ALLIANCE` are multiplayer surfaces with nothing in them for a
  visitor with no settlement.

**Fix.**
1. Give `LandingView` a pre-founding header instead of `HudNav`: `TopBar`
   with a `title` of the game wordmark, and on the right only the locale
   switcher plus an "I already have a realm" link to `/login` (i18n key
   `landing.header.haveRealm`, DE too).
2. Keep the existing `<TopBar><HudNav /></TopBar>` for the post-founding
   half of the view (`player.hasFoundedSettlement === true`) — that half is
   genuinely in-game and the nav is correct there.
3. Independently of the landing page: `HudNav.vue` should not render the
   `worldMap` link when `!player.hasFoundedSettlement`, and should not render
   the `landing` link when `route.name === 'landing'`. Both are guard-dead
   today and the same bug would show on any other pre-founding route.

**Tests.** Extend `src/frontend/e2e/landing.spec.ts`: before founding, assert
`WORLD MAP` / `REPORTS` / `ALLIANCE` are absent and "I already have a realm"
is visible; after `claimLandfall()`, assert the in-game nav is back.

---

## L2 — The guidance arrow points roughly one tile past its target

**Symptom.** The gold arrow sits on top of the plot it is meant to indicate
and its tip points into the tile below-left of it. The "ANY GLOWING PLOT"
chip floats over open sea, detached from any plot.

**Root cause.** `src/frontend/src/components/onboarding/GuidancePointer.vue`.
`useMapAnchor` writes the hex's screen centre into `--anchor-x/--anchor-y`,
and `.anchor` is placed with `transform: translate(-50%, -50%)` — so the
**centre of the 110×110 arrow SVG**, not its tip, lands on the hex.

Geometry: the tip is polygon point `75,136` in a `150×150` viewBox rendered
at 110px → 44.7px below the SVG centre. `.rotate` then rotates by `angle`
(38° pre-founding) about that same centre, putting the tip at
`(-44.7·sin38°, +44.7·cos38°) = (-27.5px, +35.2px)` from the anchor. At the
preview camera's zoom a tile's top face is on the order of 30px tall on
screen, so the tip lands a whole tile below-left of the hex it is anchored
to, and the shaft covers the hex itself.

**Fix.** Make the tip the anchored point, not the SVG centre. Cleanest is to
keep the anchor element at the hex and shift the arrow *along its own axis*
so the tip lands there — the offset is a pure function of `angle` and the
rendered tip distance, so compute it rather than hardcoding per angle
(the component's own doc comment already argues against per-angle constants):

```
--tip-dx: calc(sin(var(--rotate)) * 44.7px)
--tip-dy: calc(cos(var(--rotate)) * -44.7px)
```

applied to the `.rotate` wrapper (so the bob keyframe, which is nested inside
the rotated frame, keeps moving along the shaft). Pull `44.7` out as a named
constant derived from the viewBox tip position and the rendered size so a
future art change doesn't silently desync it.

Also add a small standoff (~8–10px) so the tip hovers just off the hex edge
rather than sitting exactly on its centre, which reads better and stops the
arrow covering the glow.

Verify the chip: with the tip on the hex, `chipSide: 'left'` should still
clear the island. If not, flip it per pointer target.

**Tests.** Unit-test the offset function (pure, no DOM) for the three angles
in use (30/38/52). In `landing.spec.ts`, assert the pointer's bounding box
overlaps the target hex's `hexCenterScreen` within a tile's height — today it
does not.

---

## L3 — "6 plots free on this island" is neither the real count nor reachable

**Symptom.** The hero claims 6 free plots; far fewer glowing hexes are
visible, and the ones that are visible are the only ones a player can reach.

**Root cause — two independent bugs.**

1. **The number is capped, not counted.**
   `src/frontend/src/views/LandingView.vue:608-616` renders
   `nearbyStartCoords.length`, which is `1 + alternatives.length`.
   `PlotReservationService.GetOrRefreshAsync`
   (`src/backend/src/Bjarnoy.Infrastructure/Services/PlotReservations/PlotReservationService.cs:166-170`)
   builds `alternatives` as
   `island.StartPositions.Where(valid).Take(_options.AlternativeCount)` with
   `AlternativeCount = 5`. So the displayed number is
   `min(actually free on this island, 6)` — it reads "6" on any island with
   six *or more* free plots. `FindStartPositions`
   (`src/backend/src/Bjarnoy.Domain/World/WorldGenerator.cs:209-270`) is
   uncapped, so a real island routinely has many more.

2. **Most of the counted plots are not on screen and cannot be reached.**
   `alternatives` are ordered by the generator's *score*, not by distance
   from the pinned plot, so they can sit anywhere on the island. Meanwhile
   the preview only draws hexes within `PREVIEW_ISLAND_RADIUS = 7` of the
   pinned plot (`HexMapRenderer.ts:2192-2194`) and the camera is locked
   (`LandingView.vue:580`, `:lock-camera="!player.hasFoundedSettlement"`), so
   there is no pan or zoom to go find the rest. The hero promises six
   clickable plots when typically two or three are on screen.

**Fix.** Pick one of:

- **(preferred, matches the mockup)** Drop the count entirely and restore the
  mockup's sub-line — `● No account · Nothing to install · Leaves in one
  click` — moving it out of the footer where it currently lives
  (`LandingView.vue:648-652`). The footer then gets the mockup's own content:
  world/season on the left and the reservation state on the right ("Your plot
  is held for N minutes", from `plotSuggestion.reservedUntil`, which the store
  already carries and nothing reads today).
- **(if the count is wanted)** Count only plots that are actually drawn *and*
  clickable: filter `nearbyStartCoords` to those within the preview crop
  before rendering both the count and the highlights, and reword the copy to
  "N plots free here". Do not raise `AlternativeCount` to make the number
  bigger — that makes bug 2 worse.

Either way, `alternatives` should be biased toward the pinned plot. Add an
`.OrderBy(distance to plot)` before the `.Take` in `PlotReservationService`
so the advisory alternatives are ones the locked preview can actually show.
That has its own test file (`PlotReservationServiceTests`).

**Tests.** Backend unit test: alternatives are the nearest valid start
positions, not the highest-scoring ones. Frontend: assert every highlighted
coord is inside the preview crop.

---

## L4 — The island sits too far right, with dead space on its left

**Symptom.** A wide empty band between the hero copy and the island; the
island itself is cut off by the right edge of the viewport.

**Root cause.** The preview camera centres on the **suggested plot**, not on
the island being drawn. `HexMapRenderer.settlementCameraOrigin()`
(`HexMapRenderer.ts:1132-1155`) takes `at = previewCenter` (the plot) as the
camera centre, and `previewFitZoom` (`HexMapRenderer.ts:625-653`) fits the
symmetric extent `max(|dx|)`, `max(|dy|)` around that same point.

The drawn island is a radius-7 disc of land around the plot and is almost
never symmetric about it — the plot is a scored interior grass hex, not a
centroid. Fitting a symmetric box around an asymmetric shape leaves a gap on
the short side and pushes the long side out of frame, which is exactly what
is on screen.

Two secondary contributors:

- `previewFitZoom` measures to hex **centres**. Each tile is `TILE_W`
  (168 world units) wide and its art overhangs upward (trees), so the real
  drawn extent is about half a tile plus overhang wider than what the fit
  accounts for. The rightmost column therefore always bleeds past the frame.
- `screenBiasX` is a fixed `0.16` (`LandingView.vue:579`) rather than derived
  from the hero column's actual width, so the subject's target position does
  not track the copy it is supposed to sit beside.

**Fix.**
1. Compute the **bounding box of the hexes actually drawn** in preview mode
   (same predicate as the `rebuildTerrain` preview branch: non-sea, within
   the island — see L5, which changes that predicate) and centre the camera
   on that box's centre, not on `previewCenter`. Keep `previewCenter` as what
   defines the island; it stops being the camera target.
2. Fit against that box's real extent plus a half-tile padding and a small
   fixed margin, so the island never touches a viewport edge.
3. Replace the magic `0.16` with a bias derived from the hero column: the
   island should be centred in the space to the right of the hero
   (`.hero` is `left: 56px; max-width: 520px`), with a minimum gutter. Expose
   it as one constant in `LandingView.vue` rather than a literal in the
   template.

`previewFitZoom` is already a pure exported function with tests in
`HexMapRenderer.test.ts:160-190` — extend those rather than adding a new
harness.

**Tests.** `HexMapRenderer.test.ts`: an island whose land is asymmetric about
the preview centre frames with equal margins on both sides and nothing past
the viewport edge.

---

## L5 — A second island shows in the preview

**Symptom.** A separate landmass (sand + forest) is drawn at the top of the
frame. The pre-founding screen is supposed to be one island.

**Root cause.** The preview crop is a **radius disc**, not an island:
`HexMapRenderer.ts:2192-2194`

```ts
if (worldModel.getTile(c.q, c.r).terrain === 'sea') continue;
if (hexDistance(c, previewCenter) > PREVIEW_ISLAND_RADIUS) continue;
```

`PREVIEW_ISLAND_RADIUS = 7`. Any *other* island with land inside that disc is
drawn too — the code comment at `HexMapRenderer.ts:601-606` states the intent
("without a hard cutoff any other island generated nearby would show too")
but a distance cutoff cannot express it. Worlds generated with islands closer
than 7 hexes always leak. The same radius also crops the real island when it
is larger than 7, which is the other half of the same wrong abstraction.

**Fix.** Cull by **landmass membership**, not distance. `WorldModel` can
flood-fill land from `previewCenter` exactly as the backend's
`WorldGenerator.FloodFill`
(`src/backend/src/Bjarnoy.Domain/World/WorldGenerator.cs:106+`) does — the
client's terrain generator is a bit-exact port, so the result matches the
backend's own island partition. Compute it once per `previewCenter` and cache
it (it is pure in the seed + centre); draw a tile only if it is in that set.

Keep a generous safety bound on the flood fill (e.g. stop past ~24 hexes) so
a pathological landmass cannot stall a rebuild, and fall back to the current
radius rule if the bound is hit.

This must land together with L4 — the camera fit has to measure the same set
of hexes the cull draws, or the framing goes wrong again.

**Tests.** `HexMapRenderer.test.ts` (or a `WorldModel` test) against a seed
with two islands inside 7 hexes: only the previewed island's tiles are
returned.

---

## L6 — Clicking a tile "errors", and landfall does not complete

**Symptom, as reported.** Clicking a tile shows an error; founding does not
work.

There are two distinct causes and both should be fixed.

### L6a — Every miss reads as an error

`LandingView.onHexClick` (`LandingView.vue:409-418`): in live mode a click on
anything that is not exactly one of the six offered plots calls
`showInvalidClickMessage(t('landing.invalidClick.pickGlowingPlot'))` →
*"You can't found there — pick one of the glowing plots."*

The hit-test itself is correct — `isoPixelToAxial`
(`src/frontend/src/lib/hex/geometry.ts:63-78`) point-in-polygons against the
same `isoTopPoints` face that `drawHighlight`
(`HexMapRenderer.ts:1498-1530`) strokes, so a click inside a visible glow does
land on that hex. The problem is the **target density**: six valid hexes on
an island of ~150 drawn tiles, of which only a few are on screen (L3), with a
guidance arrow that points at the wrong place (L2). Nearly every first click
misses, and the copy phrases the miss as a failure.

**Fix.** Do not treat this as a pure copy change — fix the reachability
first (L2, L3, L5), then soften the message to a nudge rather than a refusal
("That hex isn't up for grabs — the glowing ones are"), and flash the
highlight layer on a miss so the player is shown where to go instead of only
being told. Consider snapping a near-miss (within one hex of an offered plot)
to that plot rather than refusing it.

### L6b — Founding can succeed server-side while the client reports failure

`world.foundStartingSettlementLive`
(`src/frontend/src/stores/world.ts:422-469`) does, in order: `POST` the
founding → `model.registerSettlement` → `claimTerritory` → `syncHud` →
`refreshTradeAsync`. Only after the whole chain returns does
`LandingView.foundHere` (`LandingView.vue:485-540`) call
`player.foundSettlement(settlement.id)`, which is what writes
`bjarnoy.settlementId` to `localStorage`.

If anything between the `POST` returning `201` and that write throws, the
backend has a settlement and the browser has no record of it — the exact
state L7 describes, and unrecoverable without clearing site data.

**Fix.** Persist the settlement id immediately after the `POST` resolves,
before any local model reconciliation. Either move
`player.foundSettlement(response.id)` into the store right after the API call
(cleanest — the store already owns the response), or have `foundHere` await
only the id and do the rest afterwards. Wrap the post-`POST` reconciliation so
a failure there surfaces as "your realm exists, reloading" rather than "that
plot was just taken".

While in there: `LandingView.vue:531` shows a hardcoded English string,
`"That plot was just taken — here's another one."`, in a file where every
other message goes through `t()`. Move it to
`landing.invalidClick.plotTaken` (en + de).

**Tests.** `Bjarnoy.AppHost.Tests`: found through the real UI, then assert
`localStorage['bjarnoy.settlementId']` is set and matches the row the API
reports. A unit test on the store with a mocked API that throws after a
successful `POST` must still leave the player marked as founded.

---

## L7 — 409 on plot suggestion bricks the page (no island, no redirect)

**Symptom, as reported.** After a reload: no island renders at all, the
network tab shows `GET /worlds/{id}/plot-suggestion` → `409`, and the page
does not redirect to the settlement view.

**Root cause — three compounding bugs.**

1. **The 409 is never caught.** `world.refreshPlotSuggestion`
   (`stores/world.ts:732-744`) calls `api.getPlotSuggestion` with no error
   handling, so the `ApiError` propagates out of
   `LandingView.onMounted` (`LandingView.vue:131`). The rest of `onMounted`
   never runs, `previewCoord` stays `null`, and the canvas's
   `v-if` (`LandingView.vue:568`) is false — **no map at all**, which is
   exactly what was seen. It surfaces only as an unhandled rejection in the
   console.

2. **The redirect that exists cannot work.** The one place that does handle
   `AlreadyFounded` — `foundHere`'s catch at `LandingView.vue:527-529` —
   does `router.push('/settlement')`. The router guard
   (`src/frontend/src/router/index.ts:200-202`) sends `/settlement` back to
   `/` whenever `player.hasFoundedSettlement` is false, which is precisely the
   state that produced the 409. The push is a silent no-op.

3. **The recovery data is served and thrown away.** The backend already
   returns what is needed to recover:
   `WorldEndpoints.GetPlotSuggestion`
   (`src/backend/src/Bjarnoy.Api/Endpoints/WorldEndpoints.cs:294-305`) puts
   both `rejection = "AlreadyFounded"` **and
   `existingSettlementId`** into the `ProblemDetails` extensions. The
   frontend's `ProblemDetails` type
   (`src/frontend/src/api/types.ts:834-848`) declares `rejection` but not
   `existingSettlementId`, and nothing reads it.

**How the state is reached:** L6b (founding succeeded server-side, client
never persisted the id). Once in it, every reload 409s forever.

**Fix.**
1. Add `existingSettlementId?: string` to `ProblemDetails` in
   `src/frontend/src/api/types.ts`.
2. Give `refreshPlotSuggestion` a typed result instead of letting `ApiError`
   escape: on `409 / AlreadyFounded` return the existing settlement id; on
   `409 / NoPlotAvailable` return a "world full" state; rethrow anything else.
3. In `LandingView.onMounted`, on `AlreadyFounded`: call
   `player.foundSettlement(existingSettlementId)` (which writes
   `localStorage`, satisfying the guard), then
   `world.restoreLiveSettlement(...)` and `router.push('/settlement')` — in
   that order. The page recovers itself instead of dead-ending.
4. On `NoPlotAvailable`, render the existing `joinBlocked` hero with a new
   `landing.joinBlocked.noPlotAvailable` message rather than a blank screen.
5. `refreshPreview` (`LandingView.vue:82-93`) is fired from a 20s
   `setInterval` via `void refreshPreview()` (`LandingView.vue:99-104`), so
   the same unhandled rejection repeats every 20 seconds once anything 409s.
   Give it the same handling and stop the poll on a terminal rejection.

**Tests.** This is the highest-value gap in the suite and there is currently
**no** coverage of it (see below). Add to `Bjarnoy.AppHost.Tests`: found a
settlement, clear `bjarnoy.settlementId` from `localStorage`, reload, and
assert the page lands on `/settlement` with the settlement restored and no
console errors.

---

## Answering "is there a happy-path integration/e2e test?"

**Yes, and it passes — which is itself part of the problem.**

- Demo mode (`VITE_DEMO_MODE` default true):
  `src/frontend/e2e/landing.spec.ts` covers landing → found → both guided
  buildings → completion banner → `/settlement`. It never touches the
  backend, so none of L3/L6b/L7 can appear there.
- Live mode: `src/backend/tests/Bjarnoy.AppHost.Tests` runs the real Aspire
  stack (Postgres + API + Vite) with Playwright —
  `FoundingSettlementPersistenceTests`, `FoundingOnClickedTileTests`,
  `LandingBuildQueueTests`, `LandingOnboardingCompletionTests`. CI job:
  `.github/workflows/aspire-e2e.yml`.

**Why it did not catch any of this:**

- The suite only ever walks the happy path *forwards*. Nothing reloads the
  page in a state where the backend knows about a settlement the browser does
  not — L7's entire failure mode is uncovered.
- Nothing asserts on the framing (L4/L5) or the pointer (L2); those are
  pixels inside a WebGL canvas that no assertion looks at.
- Nothing asserts the header's contents (L1).
- The plot count (L3) is never read.

### Test debt this work must pay off

Both founding helpers click a **hardcoded pixel** derived from the current
(wrong) framing, so **fixing L4 will break them**:

- `src/frontend/e2e/helpers.ts:49-62` — `claimLandfall` clicks
  `(0.5 + 0.16) × width, 0.5 × height`, with a comment naming `screenBiasX`.
- `src/backend/tests/Bjarnoy.AppHost.Tests/LiveFrontendTestHelpers.cs:52-72`
  — clicks `0.66 × width, 0.5 × height` and **retries ten times**, which is
  the suite quietly papering over the fact that the target is not where the
  helper thinks it is.

Both must be rewritten to ask the renderer where the plot actually is, the
way `landing.spec.ts`'s ring-menu test already does via
`__settlementRenderer().hexCenterScreen(coord)`. That hook is currently
installed **demo-mode only** (`LandingView.vue:137-140`), which is why the
live helper resorts to a magic pixel — install it in live mode too (it is a
read-only camera-math accessor, and the live e2e suite is the only consumer),
then derive both click points from `world.plotSuggestion.plot`.

Per `CLAUDE.md`: raising a timeout or adding retries is not the fix here —
the selector is.

---

## Not reported, noticed while triaging

- `LandingView.vue:531` — untranslated user-facing string (covered in L6b).
- The footer (`LandingView.vue:648-652`) shows `Kettil Sea · No account ·
  Nothing to install`, splitting the mockup's hero sub-line across two
  places. Folded into L3's preferred fix.
- `plotSuggestion.reserved` / `reservedUntil` are fetched, stored
  (`stores/world.ts:83-89`) and never displayed, even though the mockup has a
  slot for exactly that ("Your plot is held for 20 minutes"). Note: the
  backend TTL is 3 minutes (`PlotReservationOptions.ReservationTtl`), not 20
  — use the real value, do not copy the mockup's number.

# UX review — action flows (2026-11)

A walk through the game's UI, one player action at a time, with a UX rating and the flaws found for each action.
The table comes first; the per-action sections with screenshots follow below it.

## Setup

- Build: `main` at `1e13c48`, Vite dev server, vendored `bg_assets_hextile` art at the pinned submodule commit.
- Two modes:
  - **Demo** (`VITE_DEMO_MODE` unset): no backend, the mode the e2e suite uses. Builds are instant there.
  - **Live**: the same frontend with `VITE_DEMO_MODE=false` against a local API (`ASPNETCORE_ENVIRONMENT=Development`,
    SQLite, one world of radius 400 created through the admin API). Real build queue, real register/login.
- Viewports: desktop 1280×800, phone 390×844 (touch). Headless Chromium, software rendering.
- Driven with Playwright through the real UI (clicks on the canvas and ring bubbles). Live mode has no debug hooks, so hexes
  there were found by clicking around the guidance arrow.
- Not covered: armies and fights (no armies exist this early, and demo mode has no army dispatch), ships, trade, a
  second settlement, admin pages, German locale.

Rating scale:

| Rating | Meaning |
|---|---|
| 5 | No friction found |
| 4 | Good; small issues only |
| 3 | Usable, with noticeable friction or confusion |
| 2 | Poor: players are likely to get stuck or misread it |
| 1 | Broken or blocking |

## Action table

| # | Action | Mode | Rating | Flaws found |
|---|---|---|---|---|
| A1 | Open the game (intro screen) | both | 4 | "Go to the map · loading 52 %" shows a percentage inside the button label; two different login entry points on the same screen ("Log in" button, plus "I already have a realm" behind the intro) |
| A2 | Choose a plot (landing map) | both | 4 | Top-right control is a two-line button ("I already have a realm / or want to join another world"), wordy and unclear what it opens; "Play intro" sits bottom-right, unrelated to the task |
| A3 | Found the settlement (landfall) | both | 3 | Fog covers ~70 % of the screen, the realm is a small patch; dark radial blob behind the step checklist; "Play intro" button is still there after founding (leftover); default name "Unnamed realm" |
| A4 | Click a hex (ring opens) | both | 3 | Hub shows raw coordinates ("HEX 59, -2", in live wrapped as "HEX -133, / 110"); in live, a hex that doesn't fit the current guided step opens a hub with **no bubbles and no explanation** |
| A5 | Open "Build" (categories) | both | 3 | 3 of 5 categories are locked at the start; the set changes by terrain without explanation (grass: Logistics open, Military shown; forest: Logistics locked, Military missing) |
| A6 | Pick a building (card) | both | 3 | Card opens on a locked building (Meadery) instead of the guided one; the hovered, buildable bubble is drawn dimmed and reads as disabled; locked card stacks redundant gates ("Requires longhouse 11", "Requires Farm level 5", "Need 460 Wood … enough in 7:40:00"); "Lum-ber-jack" hyphenated in a bubble with room |
| A7 | Place the building | demo / live | 3 / 4 | Demo: placed instantly although the card said "Build time 1:00"; no confirmation besides the arrow moving on. Live: queue panel opens, but the location reads "hex -142-128" (two negative numbers without separator) |
| A8 | Finish onboarding | both | 2 | No "continue" call to action: the only prompt is the register nudge; the way into the game is the small "SETTLEMENT" link in the top bar. Nudge says "Three buildings" while the quest beside it counts 2 of 3 producers |
| A9 | "Name your jarl" nudge | both | 3 | Popover bobs permanently (never stable; a moving click target); stays over the map on every view until answered; on phone it covers the open drawer's nav links |
| A10 | Enter the settlement view | both | 3 | Fog dominates the viewport; four HUD clusters in the corners; live anonymous players get no Quests panel until they register |
| A11 | Read resources | both | 3 | Icons without names; no tooltip on hover; live storage cap 750 is reached within hours at start rates |
| A12 | Click own Longhouse | both | 3 | Offers "Send army here" on your own longhouse with no armies; "Raze" shown but disabled; hub text "LV 1 · HEX 61, -2" wraps over three lines |
| A13 | Upgrade the Longhouse | demo | 3 | Card says cost 160 Wood / 80 Food and 2:50, but demo upgrades instantly and for free (resource bar unchanged); premium quick-upgrade hint inside the card is fine |
| A14 | Construction queue | live | 3 | Location as raw coordinates ("hex -142-128"); "Reserved for queued construction: 31w 0b …" uses unexplained abbreviations; when empty the toggle is disabled with only a tooltip |
| A15 | Quests and rewards | both | 4 | Three names for one building: "Storage House" (quest), "Storehouse" (ring), "Storage house" (tech tree); "0 of 9" counter next to visible progress is confusing; "won't fit in storage" warning is good |
| A16 | Building info toggle (H) | both | 2 | Icon (hexagon with "1") says nothing about what it does; it hides the building markers, which isn't discoverable without trying |
| A17 | Rename the realm | both | 3 | Icon-only buttons in the realm menu (sparkle = "Go to", pencil = "Rename"); dialog title is "Settlement name" for what the HUD calls the realm |
| A18 | Register | both | 3 | Browser-native validation bubbles, one error at a time, unstyled; no password rules shown before submit; after registering the realm is still "Unnamed realm" and the avatar reads "BJ" instead of the user's initials |
| A19 | Log in | both | 3 | "Playing anonymously? Create an account" on the login page reads oddly; wrong-password message and landing on the own settlement are fine |
| A20 | Returning-player menu | both | 3 | Items "Log in / Start page / Settings / Language / world list"; "Start page" is unclear |
| A21 | Log out | live | 4 | Back to the intro; fine |
| A22 | Zoom out to the world map | live | 2 | The world is white fog with the own realm as a small blob; no other islands, players or orientation aids |
| A23 | Click a hex on the world map | live | 2 | Open water offers "Send settlers" (disabled, no reason shown) and "Send army here" with zero armies; hub shows "OPEN WATER HEX -178, 121" |
| A24 | Dispatch army | live | 1 | Button looks enabled (gold) but is disabled; no tooltip or explanation that you have no army |
| A25 | Reports | live | 3 | Modal; empty state is fine; "Loading…" for several seconds on an empty list |
| A26 | Messages | live | 3 | Full page, while Reports / Guild / Profile / Leaderboards are modals over the map; empty state says "visit a player's profile", but nothing here leads to players |
| A27 | Leaderboards | live | 3 | 6 of 8 boards locked with dev status text ("Unlocks once battles exist", "once armies exist", "once guilds exist") although battles, armies and guilds exist; the reasons are hardcoded in `LeaderboardCatalogue.cs` |
| A28 | Alliance / Guild | live | 3 | Menu says "Alliance", the page says "Guild" |
| A29 | Profile | live | 4 | Fine |
| A30 | Settings | both | 3 | Technical texts ("Measured: 1 fps · 0 of 10 s at 30 fps or more", "Auto — measuring frame rate…"); "HUD bar — applies on small screens only" is shown on desktop |
| A31 | Choose a world | both | 3 | Standalone page with another header style ("Bjarnoy" without ø, no game nav); demo shows a red "Couldn't load the list of worlds" error |
| A32 | Fight simulator | live | 2 | 19 number inputs per side, all "0", no unit icons or stats; dense form; brand reads "Bjarnøy" here, "Bjarnoy" on the worlds page |
| A33 | Docs (hub, pages) | both | 4 | Clear and well structured; building naming differs from the ring (see A15) |
| A34 | Impressum | both | 1 | Placeholder text shown to players: "replace it with your actual legal notice … before going live" |
| A35 | Open an unknown URL | both | 1 | Blank dark page, no 404 message, no way back |
| A36 | Session expires / refresh token rejected | live | 1 | No redirect to login: "Couldn't load the map GET /settlements/<id> → 403", a "Connection problem — retrying GET /worlds/…/fog-chunks…" banner with raw URLs, the register nudge comes back, and the client keeps polling (~390 failing requests in ~2 min) |
| P1 | Phone: intro, landing, landfall | demo | 4 | Same as A1–A3; top bar hidden during onboarding works well on the small screen |
| P2 | Phone: build via ring | demo | 4 | Two-tap commit with the hint "Tap Reindeer Herder again to build" works; card docks at the bottom |
| P3 | Phone: drawer after onboarding | demo | 2 | Register nudge overlaps the drawer's nav (Settlement link half covered); realm name truncated ("Unnamed re…") |
| P4 | Phone: settlement HUD | demo | 3 | Drawer nav has Settlement / Reports / Alliance / Docs, desktop anonymous top bar only Settlement / Docs (same state, different nav) |

### Biggest problems

1. **A36 session expiry** — a logged-out player is stuck on raw HTTP errors while the client hammers the API.
2. **A35 / A34** — blank page on unknown URLs; Impressum placeholder text is public.
3. **A8 onboarding hand-off** — after the guided builds there is no "continue"; the register nudge is the only prompt.
4. **A24 / A23 / A22 army and world map** — disabled actions look enabled and give no reason; the world map shows nothing.
5. **Technical text in player UI (live)** — see [Developer text visible with the backend](#developer-text-visible-with-the-backend).
6. **Naming drift** — realm / settlement / longhouse, Alliance / Guild, Storehouse / Storage House, Bjarnøy / Bjarnoy.

### Developer text visible with the backend

Checked against the live screenshots; these show up with the backend, not only in demo mode:

| Where | Text | Source |
|---|---|---|
| Leaderboards (A27) | "Unlocks once battles exist.", "Unlocks once armies exist.", "Unlocks once guilds exist.", "Unlocks once weekly windows are tracked." | reasons hardcoded per board in `src/backend/src/Bjarnoy.Infrastructure/Services/LeaderboardCatalogue.cs`, texts in `leaderboard.json` `darkReasons` |
| Ring hub (A4, A12, A23) | "HEX -133, 110", "LV 1 · HEX 61, -2", "OPEN WATER HEX -178, 121" | ring hub label |
| Construction queue (A14) | "hex -142-128", "Reserved for queued construction: 31w 0b …" | queue rows and footer |
| Settings (A30) | "Auto — measuring frame rate…", "Measured: 1 fps · 0 of 10 s at 30 fps or more" | graphics section |
| Map error / connection banner (A36) | "GET /settlements/<id> → 403", "Connection problem — retrying GET /worlds/<id>/fog-chunks?…" | error overlay and banner |

Demo-only (fine as long as demo mode stays a dev tool): Armies panel "Dispatching armies requires the live backend…",
training "Training requires the live backend…", reports "Reports require the live backend…", the worlds page error.

---

## Actions in detail

### A1 Open the game (intro screen)

The first screen: the saga intro with "Hear the saga", "or play it muted" and "Go to the map", which shows the atlas
loading progress in its label.

![Intro screen](img/01-intro.jpg)

- Clear hierarchy, the USPs on the right are readable.
- "Go to the map · loading 52 %" puts a progress value into the button text; the button also has its own progress bar.

### A2 Choose a plot (landing map)

Behind the intro the landing map shows the starter plot with a "Click this plot" arrow and a three-step checklist.

![Landing map](img/02-landing.jpg)

- The guidance arrow and the checklist make the first action obvious.
- The top-right control ("I already have a realm / or want to join another world") is a two-line button; it opens a
  menu (see A20), which its label doesn't suggest.
- "Play intro" bottom-right competes with the checklist.

### A3 Found the settlement (landfall)

Clicking the plot founds the realm. The view switches to the fogged settlement map, the banner says "Landfall made."
and the checklist moves to step 2.

![Landfall](img/03-landfall.jpg)

- Most of the screen is fog; the realm takes about a quarter of the viewport.
- A dark radial shadow sits behind the checklist over the fog.
- "Play intro" is still shown after founding.
- The realm is "Unnamed realm" with no prompt to name it here.

### A4 Click a hex (ring opens)

Clicking an empty hex opens the radial ring. The arrow now points at "Build".

![Ring root](img/04-ring-root.jpg)

- The hub shows "GRASSLAND / HEX 59, -2"; the coordinates mean nothing to a player.
- Live mode, step 2 (Reindeer Herder): clicking a forest hex opens the hub alone, no bubbles, no hint which hex to pick:

![Empty ring in live mode](img/05-ring-empty-live.jpg)

### A5 Open "Build" (categories)

"Build" swaps the inner lane for the categories.

![Categories on grassland](img/06-ring-categories.jpg)
![Categories on forest](img/07-ring-categories-forest.jpg)

- Three of five categories carry a lock at the start.
- On grassland: Resource, Logistics open; Military, Defence, Shrines locked. On forest: Logistics is locked and Military
  is gone. The player can't tell why the same menu differs.

### A6 Pick a building (card)

"Resource" opens the buildings; a card next to the ring shows cost, build time and gates.

![Card on open](img/08-ring-card-default.jpg)

- Right after opening, the card shows the locked **Meadery**, not the Reindeer Herder the arrow points at.
- The locked card repeats its gates three ways ("Requires longhouse 11", "Requires Farm level 5", "Need 460 Wood · 170
  Brick · enough in 7:40:00").

- Same in the settlement view (Logistics → Cart Workshop): four gate lines for a building ten longhouse levels away.

![Locked card (Cart Workshop)](img/21-ring-locked-card.jpg)

![Card on hover](img/09-ring-card-hover.jpg)

- On hover the buildable Reindeer Herder bubble turns dark and its label greys out: it looks disabled exactly when it is
  the one to press.

### A7 Place the building

Demo: one click places it at once; the arrow moves to the forest for step 3.

![After placing (demo)](img/10-after-place-demo.jpg)

Live: the order goes to the server, the Construction panel opens with the timer.

![After placing (live)](img/11-after-place-live.jpg)

- Demo places instantly although the card says 1:00; besides the arrow there is no confirmation.
- Live: the queue row reads "hex 20--107" / "hex -142-128" (see A14).

### A8 Finish onboarding

After the Lumberjack the checklist disappears and the register nudge opens.

![Onboarding done](img/12-onboarding-done.jpg)

- There is no "Continue" or "Enter your settlement" button. The nudge ("Name your jarl" / "Later") is the only prompt;
  the way forward is the small "SETTLEMENT" link in the top bar. The happy-path e2e helper has a branch for exactly this
  (`enterSettlementAfterOnboarding` falls back to the nav link when no CTA is there).
- The nudge says "Three buildings, no jarl."; the quest panel in the next view says "Build 3 resource producers — 1 more
  to build". Both are correct, but read as a contradiction.

### A9 "Name your jarl" nudge

- The popover bobs continuously. Playwright could not click it without `force` because it never stops moving; for a
  person it is a moving target too.
- It stays open on top of the map in every view until "Later" or "Name your jarl" is pressed.
- On phone it covers the drawer's nav (see P3).

### A10 Enter the settlement view

![Settlement view (demo)](img/13-settlement.jpg)

- Fog takes most of the viewport at the default zoom.
- Four HUD areas: Quests (bottom-left), four icon buttons, Armies (bottom-right), nudge (top-right).
- Demo only: the Armies panel says "Dispatching armies requires the live backend and isn't wired up in demo mode yet."
  With the backend it says "No armies on the road." (next screenshot).

![Settlement view (live, before registering)](img/14-settlement-live-anon.jpg)

- Live, before registering: no Quests panel and no Quests toggle. After registering they appear (see A18), so the
  first quests are hidden from exactly the players onboarding is for.

### A11 Read resources

![Resource hover](img/15-resource-hover.jpg)

- Wood, Brick, Food, Iron, Population are icons only. Hovering the wood value shows no tooltip.
- Live start storage is 750 at +25 Wood/h, Brick +0/h, Iron +0/h; Brick sits at 700/750 from the start.

### A12 Click own Longhouse

![Longhouse ring](img/16-longhouse-ring.jpg)

- "Send army here" on your own longhouse with no army anywhere.
- "Raze" is shown and disabled (the longhouse can't be razed); it could be left out.
- Hub text "LONGHOUSE / LV 1 · HEX / 61, -2" wraps over three lines.

### A13 Upgrade the Longhouse

![Upgrade card](img/17-upgrade-card.jpg)
![After upgrade (demo)](img/18-after-upgrade-demo.jpg)

- The card promises cost 160 Wood / 80 Food and 2:50 build time. In demo the level jumps to 2 at once and the resource bar
  doesn't change (`WorldModel.upgradeBuilding` doesn't charge). Live goes through the queue; not compared here.
- The premium quick-upgrade line in the card is unobtrusive.

### A14 Construction queue (live)

![Construction queue](img/19-construction-live.jpg)
![Queue rows](img/19b-construction-crop.jpg)

- Rows say where by coordinates only: "hex -142-128" reads like a subtraction (q = -142, r = -128? 128?). The earlier
  run showed "hex 20--107".
- Third order: "Waiting for a slot"; footer "Reserved for queued construction: 31w 0b …" uses w/b abbreviations and is
  cut off.
- The top bar shows "626/750 (31 reserved)" — good.
- With an empty queue the Construction toggle is disabled; only its tooltip says "Nothing under construction".

### A15 Quests and rewards

![Quest claim](img/20-quest-claim.jpg)
![Quest claimed (live)](img/51-quest-claimed.jpg)

- "Up next: Build a Storage House". The ring calls it "Storehouse", the tech tree "Storage house".
- "0 of 9" / "1 of 10" in the header while the card shows 2 of 3 progress bars.
- "Some of this reward won't fit in storage." under the Claim button is a good warning.

### A16 Building info toggle (H)

![Building markers hidden](img/22-building-info-off.jpg)

- The button (hexagon with a "1") toggles the hexagon markers above the buildings. Neither the icon nor the tooltip
  ("Building info (H)") says that; the change is subtle.

### A17 Rename the realm

![Realm menu](img/23-settlement-menu.jpg)
![Rename dialog](img/24-rename.jpg)
![Renamed](img/25-renamed.jpg)

- The realm row has two icon buttons (sparkle = "Go to", pencil = "Rename…"), no text.
- The rename dialog says "SETTLEMENT NAME"; the HUD says "Unnamed realm" and "LONGHOUSE 1" below it. Three terms for one
  thing.
- Rename itself is quick: Enter saves, the map label updates.

### A18 Register

![Register validation](img/26-register-invalid.jpg)

- Browser-native validation bubbles ("Please lengthen this text to 3 characters or more"), one field at a time, in the
  browser's style rather than the game's.
- No password rules before submit; the confirm mismatch isn't flagged inline.

![After register (live)](img/27-after-register.jpg)

- Back in the settlement, the "Name your jarl" quest is ready to claim (14 days of Premium) — good.
- The realm is still "Unnamed realm" after "naming the jarl"; the avatar shows "BJ", not the user's initials (user was
  `uxjarl…`).

### A19 Log in

![Login, empty submit](img/28-login-empty.jpg)
![Login, wrong password](img/29-login-wrong.jpg)

- Same native validation as register.
- "Playing anonymously? Create an account" is an odd line for someone who came to log in.
- Wrong password: "Wrong username or password." Correct login lands on the own settlement.

### A20 Returning-player menu

![Returning-player menu](img/30-returning-menu.jpg)

- "Log in / Start page / Settings / Language / Testheim2 — You're here". "Start page" doesn't say what it does.

### A21 Log out

![After logout](img/31-after-logout.jpg)

- Account menu → Log out returns to the intro screen.

### A22 Zoom out to the world map (live)

![World map](img/32-world-map.jpg)

- At full zoom-out the screen is white fog with the own realm as a small grey blob and an "Upgrade" badge. No sea, no
  other islands, no players, no scale or compass.

### A23 Click a hex on the world map (live)

![World map ring](img/33-world-ring.jpg)

- Open water: "Send settlers" (disabled; no reason shown) and "Send army here" (enabled, but there is no army).
- Hub: "OPEN WATER / HEX -178, 121".

### A24 Dispatch army (live)

![Dispatch army](img/34-dispatch.jpg)

- The gold "Dispatch army" button is disabled. It looks like the panel's primary action, has no tooltip, and nothing says
  you need to train troops first.

### A25 Reports

![Reports](img/35-reports.jpg)

- Modal over the map with kind tabs and a simulator link. Empty state "No reports yet." is fine; before it, "Loading…"
  stayed for several seconds.

### A26 Messages

![Messages](img/36-messages.jpg)

- A full page with "← Back", unlike the modal views. "No conversations yet — visit a player's profile to send them a
  message." — there is no player list or search to get to a profile from here.

### A27 Leaderboards

![Leaderboards](img/37-leaderboards.jpg)

- Six of eight boards are locked: "Unlocks once battles exist", "Unlocks once armies exist", "Unlocks once guilds exist".
  These are development milestones, not player conditions.

### A28 Alliance / Guild

![Guild](img/38-guild.jpg)

- Account menu and phone drawer: "Alliance". The page: "Guild", "Guilds in this world", "Found a guild".

### A29 Profile

![Profile](img/39-profile.jpg)

- Name, join date, settlement count, "Add a bio". Fine.

### A30 Settings

![Settings](img/40-settings.jpg)

- "Auto — measuring frame rate…", "Measured: 1 fps · 0 of 10 s at 30 fps or more": numbers for developers.
- "HUD bar — Applies on small screens only." is listed first on desktop, where it does nothing.

### A31 Choose a world

![Worlds (live)](img/41-worlds.jpg)
![Worlds (demo)](img/42-worlds-demo.jpg)

- Its own page with a minimal header ("Bjarnoy" — no ø — and EN/DE), no game nav.
- Demo mode shows the red error "Couldn't load the list of worlds — try again in a moment."

### A32 Fight simulator

![Simulator](img/43-simulator.jpg)

- Attacker, defender and guest defenders: 19 plain number fields each, prefilled with 0, names only.
- Header: "Bjarnøy" with ø here, "Bjarnoy" on the worlds page.

### A33 Docs

![Docs hub](img/44-docs.jpg)
![Tech tree](img/45-techtree.jpg)

- Well grouped hub with art; pages have breadcrumbs and in-page tabs.
- Tech tree: "Storage house", ring: "Storehouse" (see A15).

### A34 Impressum

![Impressum](img/46-impressum.jpg)

- Visible to everyone: "This placeholder page exists so the real landing page has somewhere to link to — replace it with
  your actual legal notice (operator, contact address, and any disclosures your jurisdiction requires) before going live."

### A35 Open an unknown URL

![Unknown route](img/47-unknown-route.jpg)

- `/does-not-exist`: empty dark page. No message, no link home.

### A36 Session expires / refresh token rejected (live)

Reproduced by reopening the game with a refresh token that had already been rotated (what a player gets after the
session expires or after logging in elsewhere): `/auth/refresh` answers 401.

![Session expired](img/48-session-expired.jpg)
![Session expired, reports](img/49-session-expired-reports.jpg)

- No redirect to login. The map shows "Couldn't load the map — GET /settlements/01a21a72-… → 403 — Request failed with
  status 403" with a Retry button.
- A yellow banner "Connection problem — retrying GET /worlds/…/fog-chunks?cuMin=-1&cuMax=1…" shows raw API paths.
- The "Name your jarl" register nudge returns, though the player is registered.
- The client keeps polling reports, field/camp/trade reports and fog chunks: 394 requests answered 403 in about two
  minutes.

### P1 Phone: intro, landing, landfall

![Phone onboarding](img/p1-phone-onboarding.jpg)

- The intro stacks well; the landing hides the top bar during onboarding, which leaves room for the map.

### P2 Phone: build via ring

![Phone ring](img/p2-phone-ring.jpg)

- First tap selects and shows the card docked at the bottom with "Tap Reindeer Herder again to build"; second tap
  builds. Clear.

### P3/P4 Phone: drawer and settlement HUD

![Phone HUD](img/p3-phone-hud.jpg)

- After onboarding the realm name is cut to "Unnamed re…".
- With the drawer open, the register nudge sits on top of the nav: "Settlement" is half covered.
- The drawer lists Settlement / Reports / Alliance / Docs; the desktop top bar in the same anonymous state shows only
  Settlement / Docs.
- Settlement HUD: compact resource row, quests collapse into a bar at the bottom — works; the map area is still mostly
  fog.

### Other

- Account menu (live), for reference:

![Account menu](img/50-account-menu.jpg)

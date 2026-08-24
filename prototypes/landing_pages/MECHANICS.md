# Fjordhold — game mechanics

Brief, as given:

> Make UI mockups for a viking based browsergame, realms are like in the settlers 2 game (borders which can extend), but map is islands based and new settlements can be created similar to travian, die stämme, escaria, dominusgame.net, ...
>
> - the game is like other browsergames in "real time"
> - the landing page should hook the players straight into the game
> - the map and village is the same view/share the same optics/graphic, are one page
> - the worldmap is an abstraction of the map/village view
> - multiple settlements (of different players) can be on the same island

---

## 1. Shape of the game

A persistent, real-time browser game. No turns, no client to install. The world runs whether or not you are logged in: buildings finish, resources accrue, ships sail, and raids land on a wall clock.

A player holds one or more **settlements**. A settlement sits on an **island**, shared with other players' settlements. Islands sit in a **sea**, which is the world map.

## 2. Territory — borders that extend

Territory follows Settlers II logic, on hexes.

- Every settlement has a **claim radius** driven by its Longhouse level: Lv 4 claims 12 hexes, and each level adds hexes and build slots.
- Claimed hexes form a contiguous region; the border is drawn as the outline of that region, not as a fence per hex.
- Borders **grow** when the Longhouse or a border building (watchtower, mill, dock) levels up, and **contract** when the anchoring building is razed or captured.
- Only claimed hexes can be built on. Expansion is therefore the primary way to unlock terrain: forest for wood, crop hexes for grain, coast for docks, stone ridges for stone.
- Where two players' claims meet, borders touch. Contested hexes are drawn with both outlines; the higher-level anchor holds.

## 3. Settlements

- A player starts with one settlement, founded by choosing a plot on a starter island.
- New settlements are founded by loading a **settler crew** on a longship, sailing it to an unclaimed coastal hex on any island, and landing. This is the Travian/Die Stämme pattern: expansion by colonisation, not by conquest alone.
- Each settlement has its own resource stores, build queue and garrison. Nothing is pooled; caravans move goods between settlements.
- Settlements can be captured. Razing a settlement releases its hexes back to unclaimed.

## 4. One view: map and village

The village and the island map are **the same rendered surface**, not two screens.

- The camera moves and zooms over one isometric hex plane. Zoomed in you see huts, farms and people; zoomed out the same hexes read as terrain and territory.
- Nothing "opens" a village. Selecting a building raises a panel over the same view; the world stays visible behind it.
- Other players' settlements on the same island are rendered inline in that view, with their own borders and banners.

The **world map** is an abstraction of that plane, not a separate art style: islands become blobs, territories become coloured outlines, fleets become tracks. Zooming out from an island transitions into it.

## 5. Real time

- Resource rates are per hour and shown next to every stock (`9 340 · +615/h`).
- Build, upgrade and training queues run on wall-clock timers and continue while offline.
- Fleets sail on a timed track; the wake and ETA are visible on the map (`Landfall in 00:38:20`).
- Raids arrive on a countdown that every defender can see (`Raid inbound 04:12`).
- Consequence of this: the landing page can show the world mid-motion, because it always is.

## 6. Resources

Four stocks, each with a stock value and an hourly rate.

| Resource | Source hex | Colour |
| --- | --- | --- |
| Wood | Forest | `#c98b4b` |
| Stone | Ridge | `#9aa7ad` |
| Grain | Crop / pumpkin | `#8fc35a` |
| Silver | Trade, raids | `#6f8fa8` |

Grain also feeds population; a settlement that runs its grain to zero stops growing and its garrison starts to desert.

## 7. Buildings

- **Longhouse** — the anchor. Its level sets claim radius, build slots and settlement cap.
- **Production** — lumber camp, quarry, farm, fishing dock. Placed on the matching terrain hex.
- **Military** — barracks, shipyard, wall. Walls are placed on a border hex and only defend that approach, which is what makes the choice of *which* border hex interesting.
- **Logistics** — warehouse, harbour, market.

Buildings occupy a hex. There are more useful hexes than build slots, so expansion and demolition are both real decisions.

## 8. Conflict

- Raids are sent hex-to-hex against a specific settlement; travel time is a function of distance across the sea.
- Defenders see an inbound raid and its landing time, and can recall fleets, reinforce, or build a wall on the threatened approach.
- Successful raids take resources; sieges take territory; only a settler crew can found on empty ground.
- Clans (alliances) share vision, coordinate landings and hold islands jointly.

## 9. Onboarding

The landing page is the game, one step earlier.

- The world view is already on screen and already moving.
- The first interaction is a real move — place a building, pick a plot, choose a dish, drop a wall — not a form.
- An account is only requested once the player has something worth naming.
- No install, no download; a session is a browser tab.

---

## 10. Named entities used across the mockups

- **Bjornstad** — the player's realm. Jarl: you. Lv 4. One of three settlements.
- **Grimhold** — rival realm. Jarl: Ulf. Lv 6.
- **Havnsted** — the abandoned village in 6b, jarl gone three days.
- **Sea-Wolf** — longship carrying a settler crew, landfall 00:38:20.
- **Kettil Sea** — the world/sea the mockups are set in.
- **Nordvik** — neighbouring holding referenced in 7c.
- **fjordhold.game** — the product domain used in the browser chrome.

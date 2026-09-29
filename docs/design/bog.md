# Bogs, bog ore and the Hammerschmiede (game side)

Status: **planned**, not in the game yet. The art is being built in
`VanDooProject/3D_assets` as the **bog set** (PRs #115, #116; design
session: https://claude.ai/code/session_01KeZX9kzmCwKuGbwBo4BEBo). Its
contract, the tile list and the map rules live in that repo's
`docs/bog-tiles.md`, which is the source of truth. This page covers only what the game has to do
with it. For why iron comes from bog ore, see `economy.md` §8; for where
this sits among the open work, see §11 there.

## What the bog set provides

| Tile | What it is in the game |
|---|---|
| `bog` (moss ground, several decorated variants) | a new land terrain with its own base tile (its own `Terrain` value, not a grass variant) |
| `bogcreek`, `bogcreek_bend`, `bogcreek_spring` | creeks: water crossings on bog ground with a river's profile, so they join rivers seamlessly. They do **not** count as rivers for the Sawmill, Crop Mill or Hammerschmiede: those buildings' art has grass banks, which don't match bog ground. |
| `boglake`, `boglake_inlet`, `boglake_shore`, `boglake_half`, `boglake_mouth` | bog lakes: open water plus shore tiles with 1, 2 or 3 water edges |
| `bogoreworks` | **Bog-ore works**, the iron producer (7 levels: diggings to bloomery) |
| `fisherhut_lake` | the **Fisher Hut** on stilts on a half-shore: the same building as the coastal one, with lake art |
| `claybrickworks` (existing, re-rendered) | **Clay Brickworks** now stands on bog ground; the grass version is dropped |

The Hammerschmiede isn't part of the bog set. It still needs its own art: a
water-powered hammer mill for river tiles, like the Sawmill.

## World generation

The generator has to follow the art's map rules, or tiles are missing:

1. A bog tile touches at most three water tiles, and they are next to each
   other. Fill any notch that would give it four or more.
2. Separate lakes are at least two tiles apart.
3. Creeks run straight or bend 120°, and end in a spring or a lake mouth.
   No 60° bends, no forks.
4. A creek meets a lake only at a mouth, arriving opposite the inlet's water
   edge.
5. The fish weir (a lake variant) goes only near a lake Fisher Hut.
6. No walkways or causeways.

On top of that, the economy needs one thing: **bog ground in reach of every
start**. The Clay Brickworks on bog is the start's stone source (LH 1), and
the bog-ore works on bog are its iron source (from about LH 6). A mountain
is *not* needed at the start; where one is in reach, the Quarry is an
alternative stone source.

Bogs are part of the living lands (not a wasted or frozen pack). A bog meets
grass at a hex edge, like the wasteland does.

## Buildings

- **Bog-ore works**: new building on bog ground; the iron producer. Unlocks
  at LH 6 with no feeder. Uses the producer formulas (`economy.md` §3) and
  is storage-capped like the other producers. Its iron P₁ is tuned in the
  Economy lab so the first iron units are affordable at the rate §8 asks
  for. Terrain boost: +10% per neighbouring bog, creek or lake tile, capped
  like the others.
- **Clay Brickworks**: allowed terrain changes from grass to bog.
- **Fisher Hut**: also placeable on a bog-lake shore, using the lake art.
- **Hammerschmiede** (new, later): a radius-boost building like the Sawmill
  and Crop Mill. River hexes only (the shapes its art covers), never on a
  lake. Unlocks at LH 20 behind bog-ore works level 10, max level 20. Boosts
  bog-ore works within range, with the mills' percent and range curve.

## Open questions

- How much bog does an island get, and how is "in reach of every start"
  guaranteed: one bog patch per island, or per start region?

Decided: bog is its own `Terrain` value with its own base tile, and bog
creeks don't count as rivers for the river buildings.

## Agent prompt (game side)

> Read `CLAUDE.md`, `docs/design/economy.md` (§2, §3, §8) and this file,
> then `VanDooProject/3D_assets` `docs/bog-tiles.md` (the contract and the
> map rules), then the river code: `World/RiverGenerator.cs`,
> `RiverTile.cs`, `TerrainSampler.cs`, `WorldGenerator.cs`, the
> `src/shared/river-*-golden.json` goldens, and the frontend's river art
> lookup (`textures.ts` `riverArtFor`).
>
> **Goal: bog ground, creeks and lakes in world generation; the bog-ore
> works; Clay Brickworks and the Fisher Hut on the bog.**
>
> 1. **Terrain.** Add `Terrain.Bog` (its own base tile). Settle the open
>    question above with the user first. Then generate bogs with the map rules above, guarantee bog in reach of every
>    start, and keep the C# and TS generators byte-identical through the
>    shared goldens (regenerate them with the repo's tooling).
> 2. **Buildings.** Add the bog-ore works (new `BuildingType`), move Clay
>    Brickworks to bog ground, and let the Fisher Hut stand on a bog-lake
>    shore, all as described above. The Hammerschmiede comes separately,
>    once its art exists.
> 3. **Iron and units.** Rework unit costs and unit Longhouse gates to
>    `economy.md` §8: the Thrall costs no iron, every other unit does, and
>    unit unlocks follow the building ladder. Check in the Economy lab
>    (`/admin/economy`) that iron income and unit unlocks line up, and put
>    the numbers in the PR.
> 4. **Art.** Wire the bog families into `textures.ts`/`buildingArt.ts`
>    once they are vendored. Until then use a clearly marked placeholder and
>    say which families are missing. Don't render or push art: that's the
>    maintainer's (see the 3D_assets `AGENTS.md`).
>
> Tests: world-generation guarantees (bog in reach of every start, the map
> rules), placement rules for the buildings, the terrain boost, and the unit
> cost and gate changes.

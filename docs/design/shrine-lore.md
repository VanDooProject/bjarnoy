# Shrine lore

The god shrines (`docs/design/img` aside, their actual 3D assets are built in
the sibling `VanDooProject/3D_assets` repo, under `MapTiles/hextile/`) carry
a scrap of narrative alongside their mechanics. This doc is where that
narrative gets written down as each shrine ships, so it survives past the
PR that added it. It is not a gameplay data source - `building-catalogue.json`
and the `catalogue.json` locale files (name strings only, no flavor text
today) are unaffected by anything here.

## Odin's shrine (`hextile053_odinstatue`)

The tile: a monumental carved-oak Odin on an octagonal stone plinth, spear
in hand, a raven on each shoulder - `VanDooProject/3D_assets`
[PR #57](https://github.com/VanDooProject/3D_assets/pull/57).

In the *Poetic Edda* (Grímnismál), Huginn ("Thought") and Muninn ("Memory")
are Odin's two ravens. Every day they fly out over Midgard and back to
whisper the world's news in his ear; Odin says he fears more for Muninn's
return than Huginn's.

The shrine's animation compresses that into a three-second loop, "circler
and scout":

- **Huginn** never lands. He circles the whole statue once per loop in a
  high outer band, always watching.
- **Muninn** spends part of the loop perched on Odin's left shoulder, then
  drops off, flies a low loop out around the offering bowl in front of the
  god, climbs back, and lands facing Odin's ear before turning forward
  again - fly out, return, whisper, in miniature.

The two birds are deliberately not a mirrored pair: different path shapes,
centres, radii, heights and rhythms, because one god's-eye view keeps
watch and the other comes home to report.

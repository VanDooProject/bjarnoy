# Map marker icons

Hand-authored SVGs for the settlement map's army/route overlay (issues #93
and #94). Unlike the hex tile art (a private art-pack submodule — see
`src/frontend/vendor/bg_assets_hextile`), these live in the repo: they are
small, purely functional UI markers rather than terrain art.

Conventions every icon in this set follows, because
`src/lib/map/markerIcons.ts` loads them all the same way and
`HexMapRenderer` draws them as tinted Pixi sprites:

- **64×64 viewBox**, artwork centred on (32, 32) — the renderer anchors every
  marker sprite at 0.5/0.5, so an off-centre drawing would visibly hang off
  the hex/route point it marks.
- **Pointing right (+x)** for anything directional (`arrowhead`, `sword`,
  `axe`), so the renderer can orient it with a plain
  `atan2(dy, dx)` rotation with no per-icon correction angle.
- **White (`#fff`) as the base fill**, with darker greys only for interior
  detail. Pixi's `tint` multiplies, so a white shape takes the exact tint
  colour the renderer asks for (gold for the selected army, blue for the
  rest, red for an attack target); a coloured source would muddy it.
- **No `currentColor`, no CSS, no external references** — these are rasterised
  by the browser as standalone images for `Assets.load`, with no document
  context to inherit from.

## Icons whose anchor is not the centre

Some markers stand on a point instead of floating over it, so the renderer anchors them at a point of their own and passes
that anchor in `drawIcon`; the sprite is placed with that point on the hex (or army) position:

- **`cart`** is a side view, shaft to the right (+x), the way it travels. Its wheels' ground line is at **y 50 of 64**, so
  the renderer anchors it at `anchorY: 50 / 64` (`anchorX: 0.5`) and the cart stands on its hex. It is flipped
  (`flipX`) when it rolls to the left (heading x < 0), like the flag and the ship.
- **`flag`** (the army banner) stands on its pole's foot, at x 22.5 / y 60 of 64 (mirrored with `flipX`).
- **`ship`** floats: its waterline is the sprite's vertical centre, so it keeps the centre anchor.

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

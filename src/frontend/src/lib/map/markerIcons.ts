// The settlement map's marker icon set (issues #93/#94): the hand-authored
// SVGs in `src/assets/icons`, loaded once as Pixi textures.
//
// Why textures and not DOM: HexMapRenderer is a single PixiJS/WebGL canvas
// (see its module comment) — an `<img>`/inline `<svg>` overlay would have to
// be positioned in screen space by Vue on every camera change, one DOM node
// per marker, which is exactly the per-tile-DOM-node cost that renderer
// exists to avoid. As textures they are ordinary sprites in the same scene
// graph, batched with everything else drawing from the same texture.
//
// Mirrors `textures.ts`'s shape deliberately (one `import.meta.glob`, one
// `Assets.load` of aliased sources, a module-level promise so repeated
// callers share one load) so there is one way art gets into this renderer,
// not two. It stays a separate module because the tile art comes from a
// private submodule that may be absent, while these ship with the app.
import { Assets, Texture } from 'pixi.js';

export const MARKER_ICON_NAMES = ['sword', 'axe', 'shield', 'flag', 'waypoint-pin', 'arrowhead'] as const;

export type MarkerIconName = (typeof MARKER_ICON_NAMES)[number];

export type MarkerIcons = Record<MarkerIconName, Texture>;

// Eager glob (not one `import` per file) for the same reason textures.ts
// uses one: the set is meant to grow, and every new icon should be picked up
// by dropping a file in the directory. Vite resolves each to a hashed asset
// URL (or an inlined `data:image/svg+xml` URL for a small one) at build
// time — Pixi's `loadSvg` parser accepts both (it tests the extension *and*
// the data-URL MIME type).
const ICON_SOURCES = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

function sourceFor(name: MarkerIconName): string {
  const entry = Object.entries(ICON_SOURCES).find(([path]) => path.endsWith(`/${name}.svg`));
  if (!entry) throw new Error(`markerIcons.ts: no SVG found for icon "${name}"`);
  return entry[1];
}

let loaded: MarkerIcons | null = null;
let loading: Promise<MarkerIcons> | null = null;

/**
 * The icons, at 2x the SVGs' own 64px box so they stay crisp when the camera
 * zooms in past 1:1 (the renderer draws them at a fixed on-screen size, like
 * the rest of the marker layer's chrome).
 */
export function loadMarkerIcons(): Promise<MarkerIcons> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;

  loading = Assets.load(
    MARKER_ICON_NAMES.map((name) => ({
      alias: `icon:${name}`,
      src: sourceFor(name),
      data: { resolution: 2 },
    })),
  ).then((textures: Record<string, Texture>) => {
    const icons = {} as MarkerIcons;
    for (const name of MARKER_ICON_NAMES) {
      icons[name] = textures[`icon:${name}`];
    }
    loaded = icons;
    return icons;
  });
  return loading;
}

// Loads the WebP + JSON atlas pages produced by VanDooProject/3D_assets'
// `scripts/build_atlas.py` (see that repo's README, "Packing into atlases").
// Each *category* (`terrain`, `buildings-static`, `buildings-anim`, ...) is
// split across one or more numbered pages (`<category>-<page>.webp` +
// `.json`) once its cells don't fit one page — `related_multi_packs` in a
// page's own manifest lists its sibling pages, but we don't rely on that:
// every page of every category is vendored here, so discovering them by
// filename and merging every page of the category we're asked for is
// simpler and doesn't depend on page 0 always existing/being first.
//
// The manifest is TexturePacker-hash-shaped (`frames`/`meta`) so Pixi's own
// `Spritesheet` class parses it directly, plus a `bjarnoy` namespace (both at
// the top-level `meta` and per-frame) carrying what the game-specific side
// needs: the tile's pixel geometry, and — per frame — which render `family`
// and `layer` (`"base" | "top" | "composite"`) it is, which `Spritesheet`
// itself has no concept of and would otherwise discard during parsing. A
// `buildings-anim` page's manifest additionally carries a `clips` block
// (playback/fps/pause per clip) alongside the frames Spritesheet already
// understands — read directly off the raw manifest, not through Spritesheet.
import { Assets, Spritesheet, Texture } from 'pixi.js';

export interface AtlasFrameMeta {
  family: string;
  layer: 'base' | 'top' | 'composite';
}

export interface AtlasClip {
  name: string;
  family: string;
  orientation: string;
  camera: string;
  layer: string;
  source_level: string | null;
  variant: string | null;
  pass_suffix: string;
  anim_type: 'loop' | 'pingpong';
  playback: 'loop' | 'pingpong';
  fps: number;
  pause: number;
  frame_count: number;
  frame_padding: number;
  frames: string[];
  parts: string[];
  /** Which part of a "giant tile" (see `giantTiles.ts`) this clip animates — `C` for the anchor hex, or a `GiantPart` screen direction for a covered neighbour. Absent for every non-giant clip. */
  giant_part?: string;
  /**
   * True when `frames` carry only the clip's moving parts (everything else
   * transparent) rather than a full frame — 3D_assets PR #92's new render
   * convention. An overlay clip must be drawn on top of its own `rest` image
   * (the same building/tile with its moving parts held still, not
   * transparent), never in place of it, and never alongside the plain static
   * top texture (that would double the building). Absent/false for a clip
   * whose frames are still full images, same as every clip in the previous
   * render convention — those keep working exactly as before (frame replaces
   * the top texture, no `rest` involved).
   */
  overlay?: boolean;
  /**
   * The rest image's own frame name, resolved through the same category
   * search as `frames` (`findAtlasClip`'s `restRect`) — a normal frame in the
   * same `buildings-anim`/`wasted-buildings-anim` pages, same trimmed/
   * sourceSize conventions. Only meaningful when `overlay` is true.
   */
  rest?: string;
  /**
   * A billboard clip's per-orientation rest frame names (one clip covers
   * every camera rotation, `orientation: "*"`) — keyed by `TileOrientation`.
   * Not present in the currently vendored atlas (no billboard clip ships one
   * yet); `rest` above is what every clip that exists today uses.
   */
  rest_by_camera?: Record<string, string>;
}

// Exported (only) so atlas.test.ts can build synthetic manifests for the
// pack-fallback tests (see pagesForIndex/findFrameIn/findClipIn below) —
// real pack pages aren't vendored yet.
export interface AtlasManifest {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      rotated: boolean;
      trimmed: boolean;
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
      bjarnoy?: AtlasFrameMeta;
    }
  >;
  meta: {
    image: string;
    size: { w: number; h: number };
    scale: string;
    bjarnoy?: {
      atlasVersion: number;
      category: string;
      sourceHash: string;
      tile: { w: number; h: number; topFaceY: number; topFaceH: number };
    };
  };
  animations?: Record<string, string[]>;
  clips?: Record<string, AtlasClip>;
}

// Atlas pages live in the VanDooProject/bg_assets_hextile submodule's own
// atlas/ directory, alongside (not replacing) the individual hextiles/
// PNGs buildingArt.ts still uses (see textures.ts's module doc comment).
// Globbing the (handful of) page files themselves
// for URL discovery is a different thing from the per-tile-PNG glob this
// atlas replaces: there are a few pages per category rather than one file
// per tile/orientation/level, and the page count isn't fixed (rectpack
// decides it), so discovering pages by filename is simpler than importing
// each one by a name that can change as the art set grows.
const ATLAS_JSON = import.meta.glob('../../../vendor/bg_assets_hextile/atlas/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, AtlasManifest>;
const ATLAS_WEBP = import.meta.glob('../../../vendor/bg_assets_hextile/atlas/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * The "family packs" a category can additionally ship as — `<pack>-<category>`
 * pages (e.g. `wasted-terrain-0.webp`) alongside the plain, always-loaded
 * core category (`terrain`) — see `scripts/build_atlas.py` in
 * VanDooProject/3D_assets and `loadAtlasPackCategory`/`loadPackAtlases`
 * (textures.ts) for why: a pack's art is only needed once the matching part
 * of the world is revealed (wasted islands; frozen isles later), so it's
 * kept out of the always-loaded core pages instead of bloating them. The
 * currently vendored atlas has no pack pages at all yet — every lookup below
 * degrades gracefully to "not found" for a pack, same as for any other
 * missing category.
 */
export const ATLAS_PACKS = ['wasted', 'frozen'] as const;
export type AtlasPack = (typeof ATLAS_PACKS)[number];

const PAGE_NAME_RE = /\/([a-z0-9-]+)-(\d+)\.json$/;

// Exported (only) so atlas.test.ts can build a synthetic index for
// pagesForIndex/findFrameIn/findClipIn without touching the real, eagerly
// globbed vendored atlas.
export interface AtlasPageIndex {
  json: Record<string, AtlasManifest>;
  webp: Record<string, string>;
}

const REAL_INDEX: AtlasPageIndex = { json: ATLAS_JSON, webp: ATLAS_WEBP };

// Exported (only) so atlas.test.ts can check page discovery — in particular
// that `match[1]` is compared for exact equality, so `pagesForIndex(idx,
// 'terrain')` never picks up a `wasted-terrain-0.json` page — against
// synthetic manifests, without needing real pack pages vendored (the
// checked-in atlas doesn't ship any yet).
export function pagesForIndex(
  index: AtlasPageIndex,
  category: string,
): { manifest: AtlasManifest; webpUrl: string }[] {
  const pages: { page: number; manifest: AtlasManifest; webpUrl: string }[] = [];
  for (const [path, manifest] of Object.entries(index.json)) {
    const match = PAGE_NAME_RE.exec(path);
    if (!match || match[1] !== category) continue;
    const webpPath = path.slice(0, -'.json'.length) + '.webp';
    const webpUrl = index.webp[webpPath];
    if (!webpUrl) {
      throw new Error(`atlas.ts: manifest "${path}" has no matching .webp page`);
    }
    pages.push({ page: Number(match[2]), manifest, webpUrl });
  }
  pages.sort((a, b) => a.page - b.page);
  return pages;
}

function pagesFor(category: string): { manifest: AtlasManifest; webpUrl: string }[] {
  return pagesForIndex(REAL_INDEX, category);
}

/**
 * The categories `findAtlasFrame`/`findAtlasClip` search, in order: the
 * plain core category first, then every pack's variant of it
 * (`${pack}-${category}`). A category with no pack variant at all (e.g.
 * `showcase`, which isn't split by pack) simply never matches those extra
 * entries — harmless, not an error.
 */
// Exported (only) so atlas.test.ts can check the search order directly.
export function categorySearchOrder(category: string): readonly string[] {
  return [category, ...ATLAS_PACKS.map((pack) => `${pack}-${category}`)];
}

export interface LoadedAtlas {
  /** Every frame's live texture, keyed by frame name (e.g. `vikinghut_E_level002`). */
  textures: Record<string, Texture>;
  /** Every frame's `family`/`layer`, keyed the same way — lost by `Spritesheet.parse()`, so kept alongside it. */
  frameMeta: Record<string, AtlasFrameMeta>;
  /** Every animated clip this category's pages carry, keyed by clip name. Empty outside `buildings-anim`. */
  clips: Record<string, AtlasClip>;
}

/**
 * One frame's raw pixel rect on its atlas page, for CSS-sprite rendering
 * outside Pixi (HTML overlays: docs, tooltips, build previews).
 * `spriteSourceSize`/`sourceSize` are the same trim-offset fields Pixi's
 * `Spritesheet` uses to place a trimmed texture back onto its full canvas —
 * carried here too so a caller compositing two separately-trimmed layers
 * (e.g. a building's static base plus an animated top layer — see
 * `AnimatedBuildingSprite.vue`) can position each within a shared
 * `sourceSize`-sized box instead of assuming every frame fills its own box.
 */
export interface AtlasFrameRect {
  webpUrl: string;
  frame: { x: number; y: number; w: number; h: number };
  pageSize: { w: number; h: number };
  /** The untrimmed source canvas this frame was cut from (e.g. 400x600 for a tile, 1200x1800 for a giant) — see `spriteSourceSize`. */
  sourceSize: { w: number; h: number };
  /** Where the (trimmed) `frame` rect sits inside `sourceSize` — a trimmed frame's opaque pixels don't start at the source's own origin. */
  spriteSourceSize: { x: number; y: number; w: number; h: number };
}

// Manifests/webp URLs are already resolved eagerly at import time (see
// ATLAS_JSON/ATLAS_WEBP above), so an HTML consumer that only needs a
// frame's pixel rect for CSS sprite rendering — not a live Pixi Texture —
// can look it up synchronously, with no Assets.load/Spritesheet.parse cost.
// Exported (only) so atlas.test.ts can verify the core-then-pack fallback
// against synthetic manifests without needing real pack pages vendored.
export function findFrameIn(index: AtlasPageIndex, category: string, name: string): AtlasFrameRect | undefined {
  for (const cat of categorySearchOrder(category)) {
    for (const { manifest, webpUrl } of pagesForIndex(index, cat)) {
      const frame = manifest.frames[name];
      if (frame) {
        return {
          webpUrl,
          frame: frame.frame,
          pageSize: manifest.meta.size,
          spriteSourceSize: frame.spriteSourceSize,
          sourceSize: frame.sourceSize,
        };
      }
    }
  }
  return undefined;
}

/** Searches the core `category` first, then `${pack}-${category}` for every `AtlasPack` (see `categorySearchOrder`) — so a caller (docs pages, tooltips, HTML overlays) keeps working unchanged once wasted/frozen art moves into pack pages. */
export function findAtlasFrame(category: string, name: string): AtlasFrameRect | undefined {
  return findFrameIn(REAL_INDEX, category, name);
}

/**
 * A `buildings-anim` clip's metadata plus its frames already resolved to
 * `AtlasFrameRect`s (via `findAtlasFrame` on the same category), for a
 * caller that wants to cycle through them without re-looking-up each name.
 * Synchronous for the same reason `findAtlasFrame` is — manifests are
 * eagerly imported, so no `Assets.load`/`Spritesheet.parse` is needed just
 * to read pixel geometry.
 */
// Exported (only) so atlas.test.ts can verify the same fallback for clips.
export function findClipIn(
  index: AtlasPageIndex,
  category: string,
  name: string,
  // Only meaningful for a (not yet vendored) billboard clip's
  // `rest_by_camera` — every clip in the currently vendored atlas resolves
  // its rest through the plain `rest` field regardless of this.
  orientation?: string,
): (AtlasClip & { frameRects: AtlasFrameRect[]; restRect?: AtlasFrameRect }) | undefined {
  for (const cat of categorySearchOrder(category)) {
    for (const { manifest } of pagesForIndex(index, cat)) {
      const clip = manifest.clips?.[name];
      if (!clip) continue;
      // Resolved against the same category the clip's own page was found in
      // (`cat`, not the original `category`) — a pack clip's frames live on
      // pack pages too, and findFrameIn would otherwise search from the core
      // category's own order (itself, then every pack) rather than from
      // where this clip actually was.
      const frameRects = clip.frames
        .map((frameName) => findFrameIn(index, cat, frameName))
        .filter((f): f is AtlasFrameRect => f !== undefined);
      const restName = (orientation && clip.rest_by_camera?.[orientation]) ?? clip.rest;
      const restRect = restName ? findFrameIn(index, cat, restName) : undefined;
      return { ...clip, frameRects, restRect };
    }
  }
  return undefined;
}

/** Searches the core `category` first, then `${pack}-${category}` for every `AtlasPack` (see `categorySearchOrder`) — same fallback as `findAtlasFrame`. `orientation` only matters for a billboard clip's `rest_by_camera` (see `findClipIn`). */
export function findAtlasClip(
  category: string,
  name: string,
  orientation?: string,
): (AtlasClip & { frameRects: AtlasFrameRect[]; restRect?: AtlasFrameRect }) | undefined {
  return findClipIn(REAL_INDEX, category, name, orientation);
}

/** The CSS `background-*` properties that render one `AtlasFrameRect` as a same-aspect-ratio element — shared by `AtlasSprite.vue` and anything laying out raw frames itself (e.g. the wasted-lands island), so the sprite math exists in exactly one place. */
export interface AtlasBackgroundStyle {
  aspectRatio: string;
  backgroundImage: string;
  backgroundRepeat: string;
  backgroundSize: string;
  backgroundPosition: string;
  // Vue's `CSSProperties` requires an index signature for custom properties
  // (`--foo`) — this object is never given any, but the type has to admit
  // the possibility to satisfy `StyleValue` at both call sites (`:style`
  // bindings in AtlasSprite.vue and the wasted-lands island).
  [key: `--${string}`]: string | undefined;
}

export function atlasBackgroundStyle(rect: AtlasFrameRect): AtlasBackgroundStyle {
  const { webpUrl, frame, pageSize } = rect;
  const bgWidthPct = (pageSize.w / frame.w) * 100;
  const bgHeightPct = (pageSize.h / frame.h) * 100;
  const posXPct = pageSize.w === frame.w ? 0 : (frame.x / (pageSize.w - frame.w)) * 100;
  const posYPct = pageSize.h === frame.h ? 0 : (frame.y / (pageSize.h - frame.h)) * 100;
  return {
    aspectRatio: `${frame.w} / ${frame.h}`,
    backgroundImage: `url(${webpUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${bgWidthPct}% ${bgHeightPct}%`,
    backgroundPosition: `${posXPct}% ${posYPct}%`,
  };
}

const cache = new Map<string, Promise<LoadedAtlas>>();

/** Loads and parses every page already discovered for one category (see `pagesFor`), merging them into a single frame/clip lookup. Shared by `loadAtlasCategory`/`loadAtlasPackCategory` — the only difference between them is what happens when `pages` is empty. */
async function loadPages(pages: { manifest: AtlasManifest; webpUrl: string }[]): Promise<LoadedAtlas> {
  const textures: Record<string, Texture> = {};
  const frameMeta: Record<string, AtlasFrameMeta> = {};
  const clips: Record<string, AtlasClip> = {};

  for (const { manifest, webpUrl } of pages) {
    const pageTexture = await Assets.load<Texture>(webpUrl);
    const sheet = new Spritesheet(pageTexture, manifest);
    await sheet.parse();
    Object.assign(textures, sheet.textures);
    for (const [name, frame] of Object.entries(manifest.frames)) {
      if (frame.bjarnoy) frameMeta[name] = frame.bjarnoy;
    }
    Object.assign(clips, manifest.clips ?? {});
  }

  return { textures, frameMeta, clips };
}

/** Loads and parses every page of one atlas category, merging them into a single frame/clip lookup. Throws if the category has no vendored pages at all — for a core category (`terrain`, `buildings-static`, ...) that's a real error, unlike a pack category (see `loadAtlasPackCategory`). */
export function loadAtlasCategory(category: string): Promise<LoadedAtlas> {
  const cached = cache.get(category);
  if (cached) return cached;

  const promise = (async () => {
    const pages = pagesFor(category);
    if (pages.length === 0) {
      throw new Error(`atlas.ts: no vendored pages found for atlas category "${category}"`);
    }
    return loadPages(pages);
  })();

  cache.set(category, promise);
  return promise;
}

/**
 * Loads `${pack}-${category}` (e.g. `wasted-terrain`), for a category that
 * is only needed once its pack is revealed (see `ATLAS_PACKS`'s own doc
 * comment). Unlike `loadAtlasCategory`, no pages at all is not an error: the
 * currently vendored atlas ships no pack pages yet, and a pack whose art
 * simply hasn't been split out (or has none for this particular category,
 * e.g. a pack with no buildings of its own) should degrade to "nothing to
 * draw" rather than fail the whole load.
 */
export function loadAtlasPackCategory(pack: AtlasPack, category: string): Promise<LoadedAtlas> {
  const key = `${pack}-${category}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const pages = pagesFor(key);
    if (pages.length === 0) {
      return { textures: {}, frameMeta: {}, clips: {} };
    }
    return loadPages(pages);
  })();

  cache.set(key, promise);
  return promise;
}

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
import {
  MANIFESTS,
  PAGE_NAME_RE,
  atlasManifestVersion,
  discoveredCategories,
  discoveredPages,
  loadAtlasManifests,
} from './atlasManifests';

export { atlasManifestVersion, loadAtlasManifests };

export interface AtlasFrameMeta {
  family: string;
  layer: 'base' | 'top' | 'composite';
}

/**
 * A `meta.bjarnoy.aliases` entry — a frame name that isn't actually packed
 * on this page at all, but should resolve to another category's real frame
 * instead (e.g. a building-family's shared "grass_E_base" ground alias
 * pointing at `terrain`'s own `grasstile_E_base`, so the packer doesn't have
 * to duplicate terrain art into every building category that stands on
 * plain ground). `findFrameIn` resolves this synchronously (terrain's pages
 * are resolved from already-fetched manifests, same as every other category); `loadPages` resolves
 * it into a live Pixi `Texture` by loading `category` (already cached once
 * terrain has loaded) and copying its `frame`'s texture across. Not present
 * in the currently vendored atlas — every lookup degrades to "no aliases",
 * same as a missing pack page.
 */
export interface AtlasAliasEntry {
  category: string;
  frame: string;
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
      /** See `AtlasAliasEntry`'s own doc comment — keyed by the alias frame's own name. */
      aliases?: Record<string, AtlasAliasEntry>;
    };
  };
  animations?: Record<string, string[]>;
  clips?: Record<string, AtlasClip>;
}

// The manifests themselves are fetched lazily (see atlasManifests.ts) — only
// their URLs are globbed, so page discovery works before anything is loaded.
// Atlas pages live in the VanDooProject/bg_assets_hextile submodule's own
// atlas/ directory, alongside (not replacing) the individual hextiles/
// PNGs buildingArt.ts still uses (see textures.ts's module doc comment).
// Globbing the (handful of) page files themselves
// for URL discovery is a different thing from the per-tile-PNG glob this
// atlas replaces: there are a few pages per category rather than one file
// per tile/orientation/level, and the page count isn't fixed (rectpack
// decides it), so discovering pages by filename is simpler than importing
// each one by a name that can change as the art set grows.
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

// Exported (only) so atlas.test.ts can build a synthetic index for
// pagesForIndex/findFrameIn/findClipIn without touching the real
// vendored atlas.
export interface AtlasPageIndex {
  json: Record<string, AtlasManifest>;
  webp: Record<string, string>;
}

/** `json` is the live manifest store: it only holds the manifests fetched so far. */
const REAL_INDEX: AtlasPageIndex = { json: MANIFESTS, webp: ATLAS_WEBP };

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

/**
 * `buildings-static` (and `${pack}-buildings-static`) is split across two
 * categories on the newer atlas: `buildings-level1` carries every levelless
 * building frame (shared bases, levelless tops) plus every `_level001*`
 * frame, `buildings-static` keeps the rest (`_level000*`, `_level002*`+) —
 * see `textures.ts`'s `loadLevel1Atlases`/`loadBuildingAtlases`. Any lookup
 * of a "building static" frame by category (`findAtlasFrame`,
 * `buildingArt.ts`) has to search both, `buildings-level1` first (it's
 * loaded first — see `HexMapRenderer`'s staged merge), one place doing that
 * so it isn't sprinkled as ad hoc string lists at each call site. The older,
 * currently vendored atlas ships no `buildings-level1` pages at all, so this
 * is a harmless no-op there — `pagesForIndex` simply finds nothing for it.
 */
function withBuildingLevel1(category: string): readonly string[] {
  if (!category.endsWith('buildings-static')) return [category];
  const prefix = category.slice(0, -'buildings-static'.length);
  return [`${prefix}buildings-level1`, category];
}

/**
 * The categories `findAtlasFrame`/`findAtlasClip` search, in order: the
 * plain core category first, then every pack's variant of it
 * (`${pack}-${category}`) — each of those further expanded to also search
 * its `buildings-level1` counterpart first (see `withBuildingLevel1`). A
 * category with no pack variant at all (e.g. `showcase`, which isn't split
 * by pack) simply never matches those extra entries — harmless, not an
 * error.
 */
// Exported (only) so atlas.test.ts can check the search order directly.
export function categorySearchOrder(category: string, index: AtlasPageIndex = REAL_INDEX): readonly string[] {
  const order = [category, ...ATLAS_PACKS.map((pack) => `${pack}-${category}`)];
  if (category === 'showcase') {
    // The showcase atlas is split into `showcase` plus one `<group>-showcase`
    // category per group (wasted, frozen, camps, bog, ...) — and new groups
    // appear without ATLAS_PACKS knowing them (they are not map packs), so
    // search whatever showcase categories exist, in sorted order.
    const groups = new Set(order.slice(1));
    for (const path of Object.keys(index.json)) {
      const cat = PAGE_NAME_RE.exec(path)?.[1];
      if (cat?.endsWith('-showcase')) groups.add(cat);
    }
    return ['showcase', ...[...groups].sort()];
  }
  return order.flatMap(withBuildingLevel1);
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

// Manifests are fetched lazily (see atlasManifests.ts) and webp URLs are
// resolved at import time, so once a category's manifests are in, an HTML consumer that only needs a
// frame's pixel rect for CSS sprite rendering — not a live Pixi Texture —
// can look it up synchronously, with no Assets.load/Spritesheet.parse cost.
// Exported (only) so atlas.test.ts can verify the core-then-pack fallback
// against synthetic manifests without needing real pack pages vendored.
export function findFrameIn(index: AtlasPageIndex, category: string, name: string): AtlasFrameRect | undefined {
  // Manifests are fetched lazily: reading the version makes a computed/
  // template that calls this re-run once more manifests have arrived.
  void atlasManifestVersion.value;
  for (const cat of categorySearchOrder(category, index)) {
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
      // Not a real frame on this page — but this page's own manifest may
      // declare it as an alias of a frame packed elsewhere (see
      // `AtlasAliasEntry`). Resolved by a fresh `findFrameIn` against the
      // alias's own category (never `cat` again — an alias always points at
      // a *different*, already-loaded category, terrain today), so a target
      // category with its own pack fallback still works. A target that
      // doesn't resolve either (a bad/missing alias) simply falls through to
      // "not found", same as any other unresolved frame.
      const alias = manifest.meta.bjarnoy?.aliases?.[name];
      if (alias) {
        const resolved = findFrameIn(index, alias.category, alias.frame);
        if (resolved) return resolved;
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
 * already fetched, so no `Assets.load`/`Spritesheet.parse` is needed just
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
  void atlasManifestVersion.value; // See findFrameIn.
  for (const cat of categorySearchOrder(category, index)) {
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

// A rejected load must not stay cached: the map's "Retry" would otherwise
// replay the same failed promise instead of fetching again. Only evicts if
// the slot still holds *this* promise (an unload + reload may have replaced it).
function evictOnReject(key: string, promise: Promise<LoadedAtlas>): void {
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
}

/**
 * Called after each page of a category finishes loading — `loaded` counts
 * from 1, `total` is the category's page count known up front (`pages.length`,
 * fixed before the loop starts) — a best-effort progress signal for
 * HexMapRenderer's loading-state overlay (see `MapLoadState.progress`).
 * Sequential (one `Assets.load` at a time, same as before this was added),
 * so this is exact, not an estimate.
 */
export type AtlasPageProgress = (loaded: number, total: number) => void;

type PageInput = { manifest: AtlasManifest; webpUrl: string };

/**
 * Copies each alias's target texture (from its own category, loading it if
 * need be) into `textures`/`frameMeta`. See `loadPages`.
 */
async function resolveAliases(
  aliases: Record<string, AtlasAliasEntry>,
  textures: Record<string, Texture>,
  frameMeta: Record<string, AtlasFrameMeta>,
): Promise<void> {
  for (const [name, alias] of Object.entries(aliases)) {
    try {
      const target = await loadAtlasCategory(alias.category);
      const texture = target.textures[alias.frame];
      if (!texture) {
        console.warn(`atlas.ts: alias "${name}" points at unknown frame "${alias.frame}" in category "${alias.category}"`);
        continue;
      }
      textures[name] = texture;
      frameMeta[name] = { family: alias.family, layer: alias.layer };
    } catch (err) {
      console.warn(`atlas.ts: alias "${name}" points at unavailable category "${alias.category}"`, err);
    }
  }
}

/**
 * Loads and parses every page already discovered for one category (see
 * `pagesFor`), merging them into a single frame/clip lookup. Shared by
 * `loadAtlasCategory`/`loadAtlasPackCategory`/`loadOptionalAtlasCategory` —
 * the only difference between them is what happens when `pages` is empty.
 *
 * A page's own `meta.bjarnoy.aliases` (see `AtlasAliasEntry`) each just copy
 * an already-loaded frame's live `Texture` across from its target category
 * (loading that category too, via `loadAtlasCategory`, if it somehow isn't
 * resident yet; terrain — the only target today — always is by the time a
 * building category's aliases are read). A target that doesn't resolve
 * (missing category or frame — a bad/stale alias) just warns and drops that
 * one alias, same graceful-degradation contract as every other lookup here.
 *
 * `onPartial`, when given, is called after every page except the last with
 * a snapshot of everything loaded so far (aliases of the loaded pages
 * resolved, same as the final result) — pages arrive in priority order, so a
 * consumer can start drawing the early art before the rest has downloaded.
 * Each snapshot has its own record objects (later pages never mutate it).
 */
async function loadPages(
  pages: PageInput[],
  onPage?: AtlasPageProgress,
  onPartial?: (partial: LoadedAtlas) => void,
): Promise<LoadedAtlas> {
  const textures: Record<string, Texture> = {};
  const frameMeta: Record<string, AtlasFrameMeta> = {};
  const clips: Record<string, AtlasClip> = {};
  const aliases: Record<string, AtlasAliasEntry> = {};

  let loaded = 0;
  for (const { manifest, webpUrl } of pages) {
    const pageTexture = await Assets.load<Texture>(webpUrl);
    const sheet = new Spritesheet(pageTexture, manifest);
    await sheet.parse();
    Object.assign(textures, sheet.textures);
    for (const [name, frame] of Object.entries(manifest.frames)) {
      if (frame.bjarnoy) frameMeta[name] = frame.bjarnoy;
    }
    Object.assign(clips, manifest.clips ?? {});
    Object.assign(aliases, manifest.meta.bjarnoy?.aliases ?? {});
    onPage?.(++loaded, pages.length);

    if (onPartial && loaded < pages.length) {
      const snapshot: LoadedAtlas = { textures: { ...textures }, frameMeta: { ...frameMeta }, clips: { ...clips } };
      await resolveAliases(aliases, snapshot.textures, snapshot.frameMeta);
      try {
        onPartial(snapshot);
      } catch (err) {
        console.warn('atlas.ts: onPartial callback threw', err);
      }
    }
  }

  await resolveAliases(aliases, textures, frameMeta);
  return { textures, frameMeta, clips };
}

/** The category's loaded pages. Only meaningful once its manifests are in (`loadAtlasManifests`). */
function pagesFor(category: string): PageInput[] {
  return pagesForIndex(REAL_INDEX, category);
}

function loadCategoryOrEmpty(
  key: string,
  onPage?: AtlasPageProgress,
  onPartial?: (partial: LoadedAtlas) => void,
): Promise<LoadedAtlas> {
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    await loadAtlasManifests(key);
    const pages = pagesFor(key);
    if (pages.length === 0) {
      return { textures: {}, frameMeta: {}, clips: {} };
    }
    return loadPages(pages, onPage, onPartial);
  })();

  cache.set(key, promise);
  evictOnReject(key, promise);
  return promise;
}

let resolveBuildingStaticLoaded: () => void = () => {};
/** Resolves once `buildings-static` has been loaded via `loadAtlasCategory` — what `startBackgroundAtlasLoad` waits for. */
const buildingStaticLoaded = new Promise<void>((resolve) => {
  resolveBuildingStaticLoaded = resolve;
});

/**
 * Loads and parses every page of one atlas category, merging them into a
 * single frame/clip lookup. Throws if the category has no vendored pages at
 * all — for a core category (`terrain`, `buildings-static`, ...) that's a
 * real error, unlike a pack category (see `loadAtlasPackCategory`).
 *
 * `onPage`/`onPartial` (see `loadPages`), when given, are only actually
 * invoked the first time this category is loaded — a later call while the
 * category is already cached (in flight or resolved) returns the same
 * `Promise` without replaying progress, same as it returns the same
 * `LoadedAtlas` without replaying the page loads themselves.
 */
export function loadAtlasCategory(
  category: string,
  onPage?: AtlasPageProgress,
  onPartial?: (partial: LoadedAtlas) => void,
): Promise<LoadedAtlas> {
  const cached = cache.get(category);
  if (cached) return cached;

  const promise = (async () => {
    await loadAtlasManifests(category);
    const pages = pagesFor(category);
    if (pages.length === 0) {
      throw new Error(`atlas.ts: no vendored pages found for atlas category "${category}"`);
    }
    return loadPages(pages, onPage, onPartial);
  })();

  cache.set(category, promise);
  evictOnReject(category, promise);
  if (category === 'buildings-static') void promise.then(resolveBuildingStaticLoaded, () => {});
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
export function loadAtlasPackCategory(
  pack: AtlasPack,
  category: string,
  onPartial?: (partial: LoadedAtlas) => void,
): Promise<LoadedAtlas> {
  return loadCategoryOrEmpty(`${pack}-${category}`, undefined, onPartial);
}

/**
 * Loads a *core* (non-pack) category that may not exist at all yet — same
 * empty-if-missing degradation as `loadAtlasPackCategory`, but for a plain
 * category name rather than a `${pack}-${category}` one. Used for
 * `buildings-level1` (see `textures.ts`'s `loadLevel1Atlases`): the older
 * atlas has no such category at all (every building frame still lives in
 * `buildings-static`), which must degrade to "nothing to draw yet" rather
 * than the hard failure `loadAtlasCategory` gives a genuinely-missing core
 * category.
 */
export function loadOptionalAtlasCategory(category: string): Promise<LoadedAtlas> {
  return loadCategoryOrEmpty(category);
}

/**
 * Frees a loaded category's decoded GPU textures and drops it from the
 * internal `cache`, so a later `loadAtlasCategory`/`loadAtlasPackCategory`
 * call reloads and re-decodes it from scratch instead of replaying the same
 * (now-destroyed) `Promise`. Used by `textures.ts`'s anim-atlas loaders when
 * animations are turned off: dropping JS references to a `LoadedAtlas`
 * alone would still leave its pages' decoded pixels resident on the GPU —
 * only `Assets.unload` on the page's own URL actually releases that.
 *
 * Never throws, and a caller never needs to track which categories are
 * actually resident to safely call this: a category that was never loaded,
 * never resolved, or has no vendored pages at all (see
 * `loadAtlasPackCategory`'s "no pages" case) is simply a no-op.
 */
export async function unloadAtlasCategory(category: string): Promise<void> {
  const cached = cache.get(category);
  cache.delete(category);
  if (!cached) return;

  try {
    await cached;
  } catch {
    return; // Never resolved — nothing was actually loaded onto the GPU.
  }

  const urls = pagesFor(category).map((p) => p.webpUrl);
  if (urls.length === 0) return;
  try {
    await Assets.unload(urls);
  } catch (err) {
    console.warn(`atlas.ts: failed to unload atlas category "${category}"`, err);
  }
}

// ---------------------------------------------------------------------------
// Background warm-up: manifests first, then page bytes, once the art the map
// needs to draw is in.
// ---------------------------------------------------------------------------

const CORE_PRELOAD_ORDER = ['terrain', 'buildings-level1', 'buildings-static', 'buildings-anim'];

function isShowcaseCategory(category: string): boolean {
  return category === 'showcase' || category.endsWith('-showcase');
}

/** terrain, buildings-level1, buildings-static, buildings-anim, then everything else (packs...), then showcase categories; alphabetical within a tier. */
function categoryPriority(category: string): [number, string] {
  const core = CORE_PRELOAD_ORDER.indexOf(category);
  if (core >= 0) return [core, category];
  return [isShowcaseCategory(category) ? CORE_PRELOAD_ORDER.length + 1 : CORE_PRELOAD_ORDER.length, category];
}

function byPriority(categories: readonly string[]): string[] {
  return [...categories].sort((a, b) => {
    const [ta, na] = categoryPriority(a);
    const [tb, nb] = categoryPriority(b);
    return ta !== tb ? ta - tb : na < nb ? -1 : na > nb ? 1 : 0;
  });
}

/**
 * Fetches the manifests of `categories` (default: every discovered one) one
 * category after the other, in priority order — each is awaited before the
 * next starts so the bandwidth goes to the important ones first. A failing
 * category doesn't stop the rest; the first error is rethrown at the end.
 */
export async function preloadAtlasManifests(categories?: string[]): Promise<void> {
  let firstError: unknown;
  let failed = false;
  for (const category of byPriority(categories ?? discoveredCategories())) {
    try {
      await loadAtlasManifests(category);
    } catch (err) {
      if (!failed) firstError = err;
      failed = true;
    }
  }
  if (failed) throw firstError;
}

const prefetchedPages = new Set<string>();

/**
 * Background warm-up of the page *bytes* (HTTP cache only — nothing is
 * decoded or uploaded to the GPU): sequentially fetches every webp page, in
 * ascending page number, of each given category that isn't being loaded via
 * `loadAtlasCategory` already. Low priority, skipped entirely on a
 * data-saver connection, errors are swallowed (a later real load just
 * fetches normally), and a page is never fetched twice — calling this again
 * only fetches what the earlier calls didn't. `signal` cancels the rest.
 */
export async function prefetchAtlasPages(categories: readonly string[], signal?: AbortSignal): Promise<void> {
  const connection = typeof navigator !== 'undefined' ? (navigator as { connection?: { saveData?: boolean } }).connection : undefined;
  if (connection?.saveData) return;

  for (const category of categories) {
    for (const { path } of discoveredPages(category)) {
      if (signal?.aborted) return;
      // Re-checked per page: the category may have been loaded for real meanwhile.
      if (cache.has(category)) break;
      const webpUrl = ATLAS_WEBP[path.slice(0, -'.json'.length) + '.webp'];
      if (!webpUrl || prefetchedPages.has(webpUrl)) continue;
      prefetchedPages.add(webpUrl);
      try {
        const res = await fetch(webpUrl, { priority: 'low', signal } as RequestInit);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.blob();
      } catch (err) {
        prefetchedPages.delete(webpUrl);
        console.debug(`atlas.ts: prefetch of "${webpUrl}" failed`, err);
        if (signal?.aborted) return;
      }
    }
  }
}

let backgroundLoad: Promise<void> | null = null;

/**
 * Once the map's own art is in (`buildings-static` loaded via
 * `loadAtlasCategory`; terrain and level-1 come before it), warms the network
 * for everything else so no later load has to wait on it: all manifests
 * first (priority order), then the page bytes of buildings-anim, the pack
 * categories, and the showcase categories. Called once from main.ts;
 * repeated calls return the same promise. Decoding is deliberately not part
 * of this — animations can be switched off to save GPU memory, packs load on
 * reveal — it only removes the network wait.
 */
export function startBackgroundAtlasLoad(): Promise<void> {
  backgroundLoad ??= (async () => {
    await buildingStaticLoaded;
    try {
      await preloadAtlasManifests();
    } catch (err) {
      console.warn('atlas.ts: background manifest preload failed', err);
    }
    await prefetchAtlasPages(byPriority(discoveredCategories()));
  })();
  return backgroundLoad;
}

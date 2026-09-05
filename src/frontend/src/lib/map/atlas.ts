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
}

interface AtlasManifest {
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

const PAGE_NAME_RE = /\/([a-z0-9-]+)-(\d+)\.json$/;

function pagesFor(category: string): { manifest: AtlasManifest; webpUrl: string }[] {
  const pages: { page: number; manifest: AtlasManifest; webpUrl: string }[] = [];
  for (const [path, manifest] of Object.entries(ATLAS_JSON)) {
    const match = PAGE_NAME_RE.exec(path);
    if (!match || match[1] !== category) continue;
    const webpPath = path.slice(0, -'.json'.length) + '.webp';
    const webpUrl = ATLAS_WEBP[webpPath];
    if (!webpUrl) {
      throw new Error(`atlas.ts: manifest "${path}" has no matching .webp page`);
    }
    pages.push({ page: Number(match[2]), manifest, webpUrl });
  }
  pages.sort((a, b) => a.page - b.page);
  return pages;
}

export interface LoadedAtlas {
  /** Every frame's live texture, keyed by frame name (e.g. `vikinghut_E_level002`). */
  textures: Record<string, Texture>;
  /** Every frame's `family`/`layer`, keyed the same way — lost by `Spritesheet.parse()`, so kept alongside it. */
  frameMeta: Record<string, AtlasFrameMeta>;
  /** Every animated clip this category's pages carry, keyed by clip name. Empty outside `buildings-anim`. */
  clips: Record<string, AtlasClip>;
}

const cache = new Map<string, Promise<LoadedAtlas>>();

/** Loads and parses every page of one atlas category, merging them into a single frame/clip lookup. */
export function loadAtlasCategory(category: string): Promise<LoadedAtlas> {
  const cached = cache.get(category);
  if (cached) return cached;

  const promise = (async () => {
    const pages = pagesFor(category);
    if (pages.length === 0) {
      throw new Error(`atlas.ts: no vendored pages found for atlas category "${category}"`);
    }

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
  })();

  cache.set(category, promise);
  return promise;
}

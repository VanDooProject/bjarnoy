// Hex tile art comes from the VanDooProject/bg_assets_hextile git submodule
// at src/frontend/vendor/bg_assets_hextile (see that directory's own
// README) — not copied in, so `git submodule update --init` (or a checkout
// with `submodules: true`, as .github/workflows/frontend-ci.yml uses) is
// required before this module resolves. It's imported from outside
// public/ and one file at a time, via Vite's asset-import handling, so the
// production bundle only ever picks up the PNGs we actually reference — not
// the whole (15MB, six-rotation) asset pack. Every tile is a single 200x300
// PNG (SE camera rotation), a flat-top hex "plate" (top face 200x92,
// starting at y=140) with a thick earthen skirt below it and, for taller
// assets, props rising above it.
//
// Where the pack has one, we use its base/top split — ground-only under
// hextiles/base, props/building-only under hextiles/top, sharing the same
// 200x300 framing as the composited root file — instead of the single
// composited image. Per that directory's own README, this exists "so realm
// borders, or mouse hover effects can be placed between top-ing and base
// tile": HexMapRenderer draws base, then the border/hover layers, then top,
// so a border or hover highlight sits on the ground and tucks *under* a
// tile's trees/building rather than being sliced across their canopy.
// Terrains the pack doesn't split (sand, mountain, sea) and the one
// building it doesn't split (tower) fall back to their single
// composited image as the base layer, with no top layer.
import { Assets, Texture } from 'pixi.js';
import type { Terrain, Tile } from './types';

import seaUrl from '../../../vendor/bg_assets_hextile/hextiles/watertile_SE.png';
import sandUrl from '../../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';
import towerUrl from '../../../vendor/bg_assets_hextile/hextiles/towerbuilding_SE_level000.png';
import mountainUrl from '../../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';

import grassBaseUrl from '../../../vendor/bg_assets_hextile/hextiles/base/grasstile_SE_base.png';
import grassTopUrl from '../../../vendor/bg_assets_hextile/hextiles/top/grasstile_SE.png';
import forestBaseUrl from '../../../vendor/bg_assets_hextile/hextiles/base/foresttile_SE_base.png';
import forestTopUrl from '../../../vendor/bg_assets_hextile/hextiles/top/foresttile_SE.png';
import farmBaseUrl from '../../../vendor/bg_assets_hextile/hextiles/base/farm_crop_SE_base.png';
import farmTopUrl from '../../../vendor/bg_assets_hextile/hextiles/top/farm_crop_SE_level001.png';
import hutBaseUrl from '../../../vendor/bg_assets_hextile/hextiles/base/vikinghut_SE_base.png';
import hutTopUrl from '../../../vendor/bg_assets_hextile/hextiles/top/vikinghut_SE_level000.png';
import longhouseTopUrl from '../../../vendor/bg_assets_hextile/hextiles/top/vikinghut_SE_level004.png';

export const TILE_ART_NATIVE_W = 200;
export const TILE_ART_NATIVE_H = 300;
// Sprites are scaled uniformly from a *width* reference (sprite.width is set
// to the display tile width; height follows the native H/W aspect ratio),
// so every pixel measurement taken off the native art — including this
// vertical offset — has to be expressed as a fraction of the native WIDTH
// (200), not the native height, or it scales by the wrong factor and the
// art ends up misaligned with the (width-scaled) hex-top polygons used for
// borders/fog.
/** Fraction of the tile width down to where the flat top face begins (140 / 200). */
export const TILE_ART_TOPFACE_Y_FRAC = 140 / 200;
/** Top-face height as a fraction of the tile width (92 / 200). */
export const TILE_ART_TOPFACE_H_FRAC = 92 / 200;

export type TextureKey = Terrain | NonNullable<Tile['buildingType']>;

const BASE_SOURCES: Record<TextureKey, string> = {
  sea: seaUrl,
  sand: sandUrl,
  grass: grassBaseUrl,
  forest: forestBaseUrl,
  mountain: mountainUrl,
  hut: hutBaseUrl,
  longhouse: hutBaseUrl,
  farm: farmBaseUrl,
  tower: towerUrl,
};

// Only keys the asset pack actually splits get a top layer; the rest render
// from BASE_SOURCES alone.
const TOP_SOURCES: Partial<Record<TextureKey, string>> = {
  grass: grassTopUrl,
  forest: forestTopUrl,
  hut: hutTopUrl,
  longhouse: longhouseTopUrl,
  farm: farmTopUrl,
};

export interface TileTextures {
  base: Record<TextureKey, Texture>;
  top: Partial<Record<TextureKey, Texture>>;
}

let loaded: TileTextures | null = null;
let loading: Promise<TileTextures> | null = null;

export function loadTileTextures(): Promise<TileTextures> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;

  const baseKeys = Object.keys(BASE_SOURCES) as TextureKey[];
  const topKeys = Object.keys(TOP_SOURCES) as TextureKey[];
  const aliases = [
    ...baseKeys.map((k) => ({ alias: `base:${k}`, src: BASE_SOURCES[k] })),
    ...topKeys.map((k) => ({ alias: `top:${k}`, src: TOP_SOURCES[k]! })),
  ];

  loading = Assets.load(aliases).then((textures: Record<string, Texture>) => {
    const base = {} as Record<TextureKey, Texture>;
    baseKeys.forEach((k) => {
      base[k] = textures[`base:${k}`];
    });
    const top = {} as Partial<Record<TextureKey, Texture>>;
    topKeys.forEach((k) => {
      top[k] = textures[`top:${k}`];
    });
    loaded = { base, top };
    return loaded;
  });
  return loading;
}

export function textureKeyFor(tile: Tile): TextureKey {
  return tile.buildingType ?? tile.terrain;
}

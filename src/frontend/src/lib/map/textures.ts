// Hex tile art comes from the VanDooProject/bg_assets_hextile git submodule
// at src/frontend/vendor/bg_assets_hextile (see that directory's own
// README) — not copied in, so `git submodule update --init` (or a checkout
// with `submodules: true`, as .github/workflows/frontend-ci.yml uses) is
// required before this module resolves. It's imported from outside
// public/ and one file at a time, via Vite's asset-import handling, so the
// production bundle only ever picks up the ~9 PNGs we actually reference —
// not the whole (15MB, six-rotation) asset pack. Every tile is a single
// 200x300 PNG: a flat-top hex "plate" (top face 200x92, starting at y=140)
// with a thick earthen skirt below it and, for the taller assets, props
// rising above it — baked ground + decoration in one composited image, SE
// camera rotation.
import { Assets, Texture } from 'pixi.js';
import type { Terrain, Tile } from './types';

import seaUrl from '../../../vendor/bg_assets_hextile/hextiles/watertile_SE.png';
import sandUrl from '../../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';
import grassUrl from '../../../vendor/bg_assets_hextile/hextiles/grasstile_SE.png';
import forestUrl from '../../../vendor/bg_assets_hextile/hextiles/foresttile_SE.png';
import mountainUrl from '../../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import hutUrl from '../../../vendor/bg_assets_hextile/hextiles/vikinghut_SE_level000.png';
import longhouseUrl from '../../../vendor/bg_assets_hextile/hextiles/vikinghut_SE_level004.png';
import farmUrl from '../../../vendor/bg_assets_hextile/hextiles/farm_crop_SE_level001.png';
import watchtowerUrl from '../../../vendor/bg_assets_hextile/hextiles/towerbuilding_SE_level000.png';

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

const SOURCES: Record<TextureKey, string> = {
  sea: seaUrl,
  sand: sandUrl,
  grass: grassUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  hut: hutUrl,
  longhouse: longhouseUrl,
  farm: farmUrl,
  watchtower: watchtowerUrl,
};

let loaded: Record<TextureKey, Texture> | null = null;
let loading: Promise<Record<TextureKey, Texture>> | null = null;

export function loadTileTextures(): Promise<Record<TextureKey, Texture>> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  const keys = Object.keys(SOURCES) as TextureKey[];
  loading = Assets.load(keys.map((k) => ({ alias: k, src: SOURCES[k] }))).then(
    (textures: Record<string, Texture>) => {
      const map = {} as Record<TextureKey, Texture>;
      keys.forEach((k) => {
        map[k] = textures[k];
      });
      loaded = map;
      return map;
    },
  );
  return loading;
}

export function textureKeyFor(tile: Tile): TextureKey {
  return tile.buildingType ?? tile.terrain;
}

// Hex tile art vendored from github.com/VanDooProject/bg_assets_hextile
// (see public/hextiles/README.md). Every tile is a single 200x300 PNG:
// a flat-top hex "plate" (top face 200x92, starting at y=140) with a thick
// earthen skirt below it and, for the taller assets, props rising above it —
// baked ground + decoration in one composited image, SE camera rotation.
import { Assets, Texture } from 'pixi.js';
import type { Terrain, Tile } from './types';

export const TILE_ART_NATIVE_W = 200;
export const TILE_ART_NATIVE_H = 300;
/** Fraction of the canvas height down to where the flat top face begins. */
export const TILE_ART_TOPFACE_Y_FRAC = 140 / 300;
/** Top-face height as a fraction of the tile width (92 / 200). */
export const TILE_ART_TOPFACE_H_FRAC = 92 / 200;

export type TextureKey = Terrain | NonNullable<Tile['buildingType']>;

const SOURCES: Record<TextureKey, string> = {
  sea: '/hextiles/watertile_SE.png',
  sand: '/hextiles/sandtile_SE.png',
  grass: '/hextiles/grasstile_SE.png',
  forest: '/hextiles/foresttile_SE.png',
  mountain: '/hextiles/mountaintile_SE.png',
  hut: '/hextiles/vikinghut_SE_level000.png',
  longhouse: '/hextiles/vikinghut_SE_level004.png',
  farm: '/hextiles/farm_crop_SE_level001.png',
  watchtower: '/hextiles/towerbuilding_SE_level000.png',
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

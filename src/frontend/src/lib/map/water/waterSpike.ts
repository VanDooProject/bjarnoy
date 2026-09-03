// SPIKE — throwaway. Exists only to check the arguments in
// docs/design/water-shader.md against the real renderer before committing to
// them: does a mask baked through `isoPixelToAxial` line its coastline up with
// the painted tile art (§3.4), and does legacy art that rises above the top
// face actually get painted over (§3.3)?
//
// Deliberately garish and hard-edged — a soft, pretty foam band would hide
// exactly the misalignment this is meant to expose. Delete before phase 1.
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import { isoPixelToAxial } from '../../hex/geometry';
import { TILE_ART_NATIVE_H, TILE_ART_NATIVE_W, TILE_ART_TOPFACE_Y_FRAC } from '../textures';

export interface WaterSpikeFlags {
  enabled: boolean;
  foam: boolean;
  waves: boolean;
  /** Render the mask's channels raw instead of water — the alignment check. */
  showMask: boolean;
  /**
   * Cut the unsplit tall families into base/top halves in code
   * (splitLegacyTexture) so their overhang sits above the water mesh. Off
   * reproduces the artifact this exists to fix.
   */
  legacySplit: boolean;
}
export const waterSpikeFlags: WaterSpikeFlags = {
  enabled: true,
  foam: true,
  waves: true,
  showMask: false,
  legacySplit: true,
};

/**
 * The families the pack has no `top/` half for AND whose art rises above the
 * top face — the ones that need splitLegacyTexture. Measured from the art
 * (see scripts/measure-tile-overhang.mjs in the plan): mountaintile 66px,
 * magictower 102px, dockyard 25px, towerbuilding 20px — measured by first row
 * with >=5 opaque pixels, NOT by raw alpha bbox, which a stray near-transparent
 * top row inflates (top/foresttile_* reads 139px raw and 48px real). The other
 * unsplit families (watertile, coastalwatertile, sandtile, fishinghutbuilding)
 * are flat-topped at 0-1px and need nothing.
 *
 * For scale: the row pitch is 92px, so only magictower (1.11 rows) reaches
 * well past its own hex; mountaintile is 0.72 and the rest under a third.
 *
 * Empty once the pack ships these split, at which point this whole path goes.
 */
export const LEGACY_TALL_KEYS: ReadonlySet<string> = new Set([
  'mountain',
  'magictower',
  'tower',
  'dockyard',
]);

/**
 * Emulates the art pack's base/top split in code, for the families that do not
 * have one yet — cutting at exactly the y the pack itself cuts at, so this
 * behaves like a real split and can be deleted, unchanged, once the art ships
 * split.
 *
 * The lower piece (top face + skirt) keeps its place in `terrainBase`, so all
 * the existing isoDepthKey occlusion is untouched. The upper piece — the part
 * that rises above the top face and overhangs the hex to the north — goes to
 * `terrainTop`, above the water mesh, which is the whole point.
 */
const SPLIT_Y = Math.round(TILE_ART_NATIVE_W * TILE_ART_TOPFACE_Y_FRAC); // 140

export interface LegacySplit {
  /** Native-pixel y where this piece starts inside the 200x300 art. */
  nativeY: number;
  /** Native-pixel height of the piece. */
  nativeH: number;
  texture: Texture;
}

const splitCache = new WeakMap<Texture, { base: LegacySplit; top: LegacySplit }>();

/** Cut one unsplit tile texture into its below-top-face and above-top-face halves. */
export function splitLegacyTexture(texture: Texture): { base: LegacySplit; top: LegacySplit } {
  const cached = splitCache.get(texture);
  if (cached) return cached;
  const f = texture.frame;
  const made = {
    top: {
      nativeY: 0,
      nativeH: SPLIT_Y,
      texture: new Texture({ source: texture.source, frame: new Rectangle(f.x, f.y, f.width, SPLIT_Y) }),
    },
    base: {
      nativeY: SPLIT_Y,
      nativeH: TILE_ART_NATIVE_H - SPLIT_Y,
      texture: new Texture({
        source: texture.source,
        frame: new Rectangle(f.x, f.y + SPLIT_Y, f.width, f.height - SPLIT_Y),
      }),
    },
  };
  splitCache.set(texture, made);
  return made;
}

/** Texels per tile width. 8 → one texel ≈ 1/8 hex (see the doc's §2.2). */
const TEXELS_PER_TILE = 8;
/** Long-edge cap, so a zoomed-out world map can't ask for a huge bake. */
const MAX_TEXELS = 512;
/** How far out from land the R channel ramps, in tile widths. */
const REACH_TILES = 1.5;

export interface WorldRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface TerrainLookup {
  isLand(q: number, r: number): boolean;
}

export interface BakedMask {
  data: Uint8Array;
  width: number;
  height: number;
  /** World-space rect the texture covers. */
  rect: WorldRect;
}

/**
 * Two-pass chamfer distance transform (3-4 weights, /3 to get texel units).
 * Approximate rather than an exact euclidean transform — good to a few
 * percent, which is far below what this spike is trying to see.
 */
function chamfer(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? 0 : INF;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

function hashSeed(q: number, r: number): number {
  let h = (Math.imul(q, 374761393) ^ Math.imul(r, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 0xff;
}

/**
 * Bake the water mask over `rect`. The world→hex step goes through
 * `isoPixelToAxial` — which is defined in terms of the `isoTopPoints` top-face
 * hexagon — and NOT through anything derived from sprite bounds. That choice
 * is the whole point of the spike: it is what should make the mask's coastline
 * land exactly on the art's coastline.
 */
export function bakeWaterMask(rect: WorldRect, tileW: number, tileH: number, terrain: TerrainLookup): BakedMask {
  const worldW = rect.maxX - rect.minX;
  const worldH = rect.maxY - rect.minY;
  const ideal = TEXELS_PER_TILE / tileW;
  const scale = Math.min(ideal, MAX_TEXELS / Math.max(worldW, worldH));
  const width = Math.max(2, Math.ceil(worldW * scale));
  const height = Math.max(2, Math.ceil(worldH * scale));

  const water = new Uint8Array(width * height);
  const land = new Uint8Array(width * height);
  const seed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const wy = rect.minY + ((y + 0.5) / height) * worldH;
    for (let x = 0; x < width; x++) {
      const wx = rect.minX + ((x + 0.5) / width) * worldW;
      const hex = isoPixelToAxial({ x: wx, y: wy }, tileW, tileH);
      const isLand = terrain.isLand(hex.q, hex.r);
      const i = y * width + x;
      water[i] = isLand ? 0 : 1;
      land[i] = isLand ? 1 : 0;
      seed[i] = hashSeed(hex.q, hex.r);
    }
  }

  const distFromLand = chamfer(land, width, height);
  const distFromWater = chamfer(water, width, height);
  // Texel size in world units (x and y differ slightly; use x, close enough here).
  const texelWorld = worldW / width;
  const reachWorld = REACH_TILES * tileW;
  const bleedWorld = 0.35 * tileW;

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const out = Math.min(1, (distFromLand[i] * texelWorld) / reachWorld);
    const inn = Math.min(1, (distFromWater[i] * texelWorld) / bleedWorld);
    data[i * 4 + 0] = Math.round(out * 255);
    data[i * 4 + 1] = Math.round(inn * 255);
    data[i * 4 + 2] = seed[i];
    data[i * 4 + 3] = water[i] ? 255 : 0;
  }
  return { data, width, height, rect };
}

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vWorld;

// Bound automatically by Pixi's mesh pipe (globalUniforms group 100 /
// localUniforms group 101) — this is what lets the quad live inside the
// camera-transformed \`world\` container instead of being a clip-space stage
// child the way FogMaskLayer is.
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vUV = aUV;
  vWorld = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uMask;
uniform float uTime;
uniform float uFoam;
uniform float uWaves;
uniform float uShowMask;
uniform float uTileW;

void main() {
  vec4 m = texture(uMask, vUV);

  if (uShowMask > 0.5) {
    // Raw channels: red = distance from land, green = bleed into land,
    // blue tint = water coverage. Hard steps, so the coastline the mask
    // believes in is a crisp line you can lay over the art.
    float band = step(0.5, fract(m.r * 6.0));
    finalColor = vec4(m.r * band, m.g, m.a * 0.5, 0.85);
    return;
  }

  if (m.a < 0.5) discard; // land per the mask — draw nothing

  float d = m.r; // 0 at the coast, 1 at the reach

  // Shoreline foam: two hard bands. Hard on purpose — a soft gradient would
  // hide a half-tile offset, which is exactly what this is checking for.
  float foam = 0.0;
  if (uFoam > 0.5) {
    float surge = 0.5 + 0.5 * sin(uTime * 1.6 + m.b * 24.0);
    float inner = 1.0 - step(0.10, d);
    float outer = (1.0 - step(0.10 + 0.16 * surge, d)) * step(0.10, d);
    foam = inner + outer * 0.55;
  }

  // Mid-water crests: plain scrolling bands, only past the foam reach.
  float wave = 0.0;
  if (uWaves > 0.5) {
    float phase = (vWorld.x * 0.35 + vWorld.y * 0.9) / uTileW;
    float s = sin(phase * 3.14159 + uTime * 1.1);
    wave = smoothstep(0.86, 1.0, s) * smoothstep(0.30, 0.55, d);
  }

  vec3 col = mix(vec3(0.05, 0.45, 0.62), vec3(1.0, 0.0, 0.85), foam);
  col = mix(col, vec3(0.55, 1.0, 1.0), wave);
  float a = max(foam, wave) * 0.95;
  if (a < 0.01) discard;
  finalColor = vec4(col * a, a);
}
`;

let sharedProgram: GlProgram | null = null;

export class WaterSpikeLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private readonly geometry: MeshGeometry;
  private texture: Texture | null = null;

  constructor(tileW: number) {
    sharedProgram ??= new GlProgram({ vertex: VERTEX, fragment: FRAGMENT, name: 'water-spike' });
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uFoam: { value: 1, type: 'f32' },
      uWaves: { value: 1, type: 'f32' },
      uShowMask: { value: 0, type: 'f32' },
      uTileW: { value: tileW, type: 'f32' },
    });
    this.geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
      glProgram: sharedProgram,
      resources: { waterUniforms: this.uniforms, uMask: Texture.WHITE.source },
    });
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.mesh.eventMode = 'none';
  }

  setMask(mask: BakedMask): void {
    const previous = this.texture;
    this.texture = new Texture({
      source: new BufferImageSource({ resource: mask.data, width: mask.width, height: mask.height }),
    });
    // Rebind before destroying: Pixi warns (and leaves a dangling bind group)
    // if a texture source is destroyed while a shader still references it.
    this.mesh.shader!.resources.uMask = this.texture.source;
    previous?.destroy(true);

    // The quad is placed in WORLD coordinates covering exactly the region the
    // mask was baked over, so mask UV and world position stay locked together
    // however the camera moves.
    const { minX, minY, maxX, maxY } = mask.rect;
    const p = this.geometry.getBuffer('aPosition');
    p.data.set([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    p.update();
  }

  tick(nowMs: number): void {
    const u = this.uniforms.uniforms;
    u.uTime = nowMs / 1000;
    u.uFoam = waterSpikeFlags.foam ? 1 : 0;
    u.uWaves = waterSpikeFlags.waves ? 1 : 0;
    u.uShowMask = waterSpikeFlags.showMask ? 1 : 0;
    this.mesh.visible = waterSpikeFlags.enabled;
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.mesh.destroy();
  }
}

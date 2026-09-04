// The water mesh — docs/design/water-shader.md §3.1. A Pixi v8 Mesh with
// world-space geometry, living *inside* the camera-transformed `world`
// container rather than on the stage the way fog's two quads do (waterShader.ts
// explains why at length).
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import type { WaterMask } from './waterMask';
import { waterDebugFlags } from './waterDebug';
import { WATER_FRAGMENT, WATER_VERTEX } from './waterShader';

/** Which view this layer is drawing for — decides whether the sea body term is available at all (§4.1). */
export type WaterMode = 'world' | 'settlement';

// WorldMapCanvas.vue's `.map-container` gradient endpoints. Kept in sync with
// it deliberately: with `seaBody` off the CSS gradient is what shows through,
// so the two want to be the same water.
const SHALLOW_COLOR = 0x2a92ae;
const DEEP_COLOR = 0x0b3c50;

/**
 * Peak-to-peak brightness of the open-water mottle, and the reciprocal of its
 * feature size in world units. TILE_W is 168, so 1/1400 puts one blob at
 * roughly eight hexes across — large enough to read as the sea not being a
 * flat fill rather than as texture on it, which at this amplitude (±1.5% of
 * the colour) is all it is meant to do.
 */
const SEA_MOTTLE = 0.03;
const SEA_MOTTLE_SCALE = 1 / 1400;

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

let sharedGlProgram: GlProgram | null = null;
function waterGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: WATER_VERTEX, fragment: WATER_FRAGMENT, name: 'water' });
  return sharedGlProgram;
}

let sharedPlaceholderTexture: Texture | null = null;
/**
 * A 1x1 "all land" texture (A = 0), bound before the first bake. Every term in
 * the shader is gated on water coverage, so this renders as nothing at all —
 * the right default for a frame drawn before the mask exists, rather than a
 * viewport-sized flash of open ocean.
 */
function placeholderTexture(): Texture {
  sharedPlaceholderTexture ??= new Texture({
    source: new BufferImageSource({ resource: new Uint8Array([0, 255, 0, 0]), width: 1, height: 1 }),
  });
  return sharedPlaceholderTexture;
}

export class WaterLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private readonly geometry: MeshGeometry;
  private readonly mode: WaterMode;
  private texture: Texture | null = null;
  // The previous mask texture, kept one generation past its replacement — see setMask.
  private retiredTexture: Texture | null = null;
  private hasMask = false;
  // The shader's own clock, accumulated rather than read off performance.now()
  // — same rationale as FogMaskLayer.tick's: the wave-speed slider changes the
  // *rate* from wherever the pattern currently is, instead of rescaling the
  // whole elapsed clock and teleporting every crest on each drag of the handle.
  private lastTickAtMs: number | null = null;
  private clock = 0;
  private suppressed = false;

  constructor(mode: WaterMode) {
    this.mode = mode;
    const [shallowR, shallowG, shallowB] = hexToRgb01(SHALLOW_COLOR);
    const [deepR, deepG, deepB] = hexToRgb01(DEEP_COLOR);

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uSeaBody: { value: 0, type: 'f32' },
      uShowMask: { value: 0, type: 'f32' },
      uShallowColor: { value: new Float32Array([shallowR, shallowG, shallowB]), type: 'vec3<f32>' },
      uDeepColor: { value: new Float32Array([deepR, deepG, deepB]), type: 'vec3<f32>' },
      uSeaMottle: { value: SEA_MOTTLE, type: 'f32' },
      uMottleScale: { value: SEA_MOTTLE_SCALE, type: 'f32' },
    });

    this.geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    this.mesh = new Mesh({
      geometry: this.geometry,
      shader: new Shader({
        glProgram: waterGlProgram(),
        resources: { waterUniforms: this.uniforms, uWaterMask: placeholderTexture().source },
      }),
    });
    // Like the fog quads: this covers the whole viewport and would otherwise
    // sit directly over every hex, army marker and waypoint pin under it.
    this.mesh.eventMode = 'none';
    this.mesh.visible = false;
  }

  /**
   * Uploads a freshly-baked mask and moves the quad onto the exact world rect
   * it was baked over, so mask UV and world position stay locked together
   * however the camera moves.
   *
   * Two things here are about texture lifetime rather than water. A re-bake at
   * the same zoom produces the same texel dimensions, so the common case
   * rewrites the existing source's buffer in place — no new GPU texture, no
   * rebind, no garbage. And when the dimensions *do* change (a zoom crossing
   * the texel budget), the outgoing texture is held for one more generation
   * rather than destroyed on the spot: Pixi's BindGroup still references it
   * until the next render, and destroying it out from under that is what
   * produces the "a 'textureSource' was destroyed while still bound to a
   * shader" warning the fog mask's own swap already logs.
   */
  setMask(mask: WaterMask): void {
    if (this.texture && this.texture.width === mask.width && this.texture.height === mask.height) {
      const source = this.texture.source as BufferImageSource;
      source.resource = mask.data;
      source.update();
    } else {
      this.retiredTexture?.destroy(true);
      this.retiredTexture = this.texture;
      this.texture = new Texture({
        source: new BufferImageSource({
          resource: mask.data,
          width: mask.width,
          height: mask.height,
          // Linear, not nearest: the mask is a distance field, and
          // interpolating it is what puts the land/water boundary at a
          // sub-texel position instead of on a texel edge — the difference
          // between a foam band that traces the coast and one that reads as
          // stair-stepped.
          scaleMode: 'linear',
          // The quad covers exactly the baked rect, so UVs never leave 0..1;
          // clamping is belt-and-braces against a filter tap at the very edge
          // wrapping around to the far side of the mask.
          addressMode: 'clamp-to-edge',
        }),
      });
      this.mesh.shader!.resources.uWaterMask = this.texture.source;
    }

    const { minX, minY, maxX, maxY } = mask.region.rect;
    const positions = this.geometry.getBuffer('aPosition');
    positions.data.set([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    positions.update();
    this.hasMask = true;
  }

  /**
   * Hides the layer without discarding its mask — for the states §3.6 lists
   * where water must not draw at all (landing-page preview, and a `deepFogOnly`
   * rebuild where the whole viewport is under opaque mist and this would be
   * both invisible and the most expensive thing on screen).
   */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  /** Syncs the debug flags onto uniforms and advances the animation clock. Once a frame. */
  tick(nowMs: number): void {
    const sinceLast = this.lastTickAtMs === null ? 0 : nowMs - this.lastTickAtMs;
    this.lastTickAtMs = nowMs;
    this.clock += sinceLast / 1000;

    const u = this.uniforms.uniforms;
    u.uTime = this.clock;
    // Settlement mode never draws a sea body: the painted water tiles are it.
    u.uSeaBody = this.mode === 'world' && waterDebugFlags.seaBody ? 1 : 0;
    u.uShowMask = waterDebugFlags.showWaterMask ? 1 : 0;

    this.mesh.visible = waterDebugFlags.water && this.hasMask && !this.suppressed;
  }

  destroy(): void {
    this.retiredTexture?.destroy(true);
    this.texture?.destroy(true);
    this.mesh.destroy();
  }
}

// One of fog v2's two screen-space quads (§4: "black fog" out-of-sight tint,
// "white mist" never-scouted mist) — a Pixi v8 Mesh sampling the fetched
// mask texture through a shared GLSL shader (fogShader.ts). The first
// custom-shader code in this codebase; see HexMapRenderer.ts's own comment
// on how this replaces v1's per-hex blob/pattern-sprite fog entirely.
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import { FOG_FRAGMENT, FOG_VERTEX } from './fogShader';

export type FogTier = 'outOfSight' | 'unknown';

/** How long a newly-set mask texture takes to fully cross-fade in (§2.6). */
const REVEAL_FADE_MS = 600;

// Amplitude of the UV warp's two octaves, in UV (texel-fraction) units —
// picked directly in that space rather than converted from "hexes" (the
// design doc's own unit): the ratio of hexes to texels varies with world
// size, and a UV-space amplitude gives the same visual wobble regardless.
const WARP_AMPLITUDE: [number, number] = [0.006, 0.006];
const WIND: [number, number] = [0.015, -0.01];

let sharedGlProgram: GlProgram | null = null;
function fogGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: FOG_VERTEX, fragment: FOG_FRAGMENT, name: 'fog-mask' });
  return sharedGlProgram;
}

let sharedPlaceholderTexture: Texture | null = null;
/**
 * A 1x1 "fully unknown" texture (R=255 unknown, G=0 out-of-sight, matching
 * FogMaskCell.FullyUnknown on the backend) — bound to both `uMask` and
 * `uMaskPrev` before the first real fetch resolves, so a slow network read
 * shows the correct "never scouted" default instead of nothing at all.
 */
function placeholderTexture(): Texture {
  if (!sharedPlaceholderTexture) {
    sharedPlaceholderTexture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array([255, 0, 0, 255]),
        width: 1,
        height: 1,
      }),
    });
  }
  return sharedPlaceholderTexture;
}

function fullscreenGeometry(): MeshGeometry {
  // Clip-space corners paired with DOM-style (top=0) UVs — see fogShader.ts's
  // vertex shader: this mesh always covers the whole framebuffer, with no
  // projection/world matrix of its own, so the geometry itself is the only
  // place the screen-covering quad is defined.
  return new MeshGeometry({
    positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

export interface FogMaskLayerColors {
  scoutedColor: number;
  unexploredColor: number;
  scoutedAlpha: number;
}

/**
 * World-to-mask-UV affine (map-fog-v2.md §2.1) plus the mask's own texel
 * dimensions — everything FogMaskLayer needs to place a fetched texture
 * correctly, computed by the caller from `worldMaskBounds` (fogMaskLayout.ts)
 * and the isoGridPosition-derived tile constants (TILE_W/TILE_H).
 */
export interface FogMaskPlacement {
  scale: [number, number];
  offset: [number, number];
}

export class FogMaskLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private fadeStartedAt: number | null = null;
  private fadeFromBlend = 0;

  constructor(tier: FogTier, colors: FogMaskLayerColors) {
    const [scoutedR, scoutedG, scoutedB] = hexToRgb01(colors.scoutedColor);
    const [unexploredR, unexploredG, unexploredB] = hexToRgb01(colors.unexploredColor);

    this.uniforms = new UniformGroup({
      uCameraPos: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uZoom: { value: 1, type: 'f32' },
      uViewport: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uWorldToMaskScale: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uWorldToMaskOffset: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uTier: { value: tier === 'outOfSight' ? 0 : 1, type: 'f32' },
      uScoutedColor: { value: new Float32Array([scoutedR, scoutedG, scoutedB]), type: 'vec3<f32>' },
      uUnexploredColor: { value: new Float32Array([unexploredR, unexploredG, unexploredB]), type: 'vec3<f32>' },
      uScoutedAlpha: { value: colors.scoutedAlpha, type: 'f32' },
      uWarp: { value: new Float32Array(WARP_AMPLITUDE), type: 'vec2<f32>' },
      uTime: { value: 0, type: 'f32' },
      uWind: { value: new Float32Array(WIND), type: 'vec2<f32>' },
      uMaskBlend: { value: 1, type: 'f32' },
      uShowRaw: { value: 0, type: 'f32' },
    });

    const shader = new Shader({
      glProgram: fogGlProgram(),
      resources: {
        fogUniforms: this.uniforms,
        uMask: placeholderTexture().source,
        uMaskPrev: placeholderTexture().source,
      },
    });

    this.mesh = new Mesh({ geometry: fullscreenGeometry(), shader });
    // A screen-space full-viewport quad in clip space needs no hit-testing —
    // and would otherwise sit directly over every hex, army marker, and
    // waypoint pin underneath it.
    this.mesh.eventMode = 'none';
  }

  /** Called once per resize/camera change — cheap, no texture work. */
  setCamera(camera: { x: number; y: number; zoom: number }, viewport: { width: number; height: number }): void {
    const cameraPos = this.uniforms.uniforms.uCameraPos as Float32Array;
    cameraPos[0] = camera.x;
    cameraPos[1] = camera.y;
    this.uniforms.uniforms.uZoom = camera.zoom;
    const vp = this.uniforms.uniforms.uViewport as Float32Array;
    vp[0] = viewport.width;
    vp[1] = viewport.height;
  }

  /** Called once whenever the world/mask bounds change (world join, reseed). */
  setPlacement(placement: FogMaskPlacement): void {
    const scale = this.uniforms.uniforms.uWorldToMaskScale as Float32Array;
    scale[0] = placement.scale[0];
    scale[1] = placement.scale[1];
    const offset = this.uniforms.uniforms.uWorldToMaskOffset as Float32Array;
    offset[0] = placement.offset[0];
    offset[1] = placement.offset[1];
  }

  /**
   * Swaps in a freshly-fetched mask texture, keeping the previous one bound
   * as `uMaskPrev` and animating `uMaskBlend` 0→1 over REVEAL_FADE_MS — §2.6's
   * reveal cross-fade, shared by a settlement's founding reveal and a mask
   * simply finishing a fetch after a moment of default-unknown.
   */
  setMaskTexture(texture: Texture): void {
    const shader = this.mesh.shader!;
    shader.resources.uMaskPrev = shader.resources.uMask;
    shader.resources.uMask = texture.source;
    this.fadeStartedAt = performance.now();
    this.fadeFromBlend = 0;
    this.uniforms.uniforms.uMaskBlend = 0;
  }

  /**
   * §2.8's real (functional, not cosmetic) debug toggles: `warp` zeroes the
   * UV warp amplitude entirely (a dead-straight ring edge, same diagnostic
   * value as v1's distJitter off); `showRawMask` bypasses the warp and tier
   * compositing, rendering the fetched mask texture unmodified.
   */
  setDebug(opts: { warpEnabled: boolean; showRawMask: boolean }): void {
    const warp = this.uniforms.uniforms.uWarp as Float32Array;
    warp[0] = opts.warpEnabled ? WARP_AMPLITUDE[0] : 0;
    warp[1] = opts.warpEnabled ? WARP_AMPLITUDE[1] : 0;
    this.uniforms.uniforms.uShowRaw = opts.showRawMask ? 1 : 0;
  }

  /**
   * Advances uTime (the UV warp's animation clock, unless `driftEnabled` is
   * false — §2.8's drift toggle freezes the warp pattern in place) and the
   * reveal cross-fade, if one is running.
   */
  tick(nowMs: number, driftEnabled: boolean): void {
    if (driftEnabled) this.uniforms.uniforms.uTime = nowMs / 1000;

    if (this.fadeStartedAt === null) return;
    const t = Math.min(1, (nowMs - this.fadeStartedAt) / REVEAL_FADE_MS);
    this.uniforms.uniforms.uMaskBlend = this.fadeFromBlend + (1 - this.fadeFromBlend) * t;
    if (t >= 1) this.fadeStartedAt = null;
  }

  destroy(): void {
    this.mesh.destroy();
  }
}

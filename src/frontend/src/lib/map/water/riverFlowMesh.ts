// The river flow mesh — docs/design/water-shader.md §4.4e. Draws the river flow (riverShader.ts) on its own quad over the river
// flow texture's world rect, right above the water mesh (worldLayerOrder), instead of inside the water shader that every water and
// land pixel runs. WaterLayer owns one and feeds it the mask, the clock and the debug flags, so the two always agree.
import { GlProgram, Mesh, MeshGeometry, Shader, type Texture, UniformGroup, type TextureSource } from 'pixi.js';
import { noiseLatticeTexture } from '../shaderNoise';
import { hexToRgb01, placeholderDryTexture } from '../shaderResources';
import { groundSquash } from './waterMask';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import { RIVER_FRAGMENT } from './riverShader';
import { WATER_VERTEX } from './waterShader';

/**
 * River ripples (docs/design/water-shader.md §4.4e). The crests slide `RIVER_SPEED_TURNS_PER_SECOND` whole ripple periods per
 * second towards the out edge (a period is about `RIPPLE_WAVELENGTH_TEXELS` texels, an eighth of a tile). The noise that breaks
 * the crests into pieces has `RIVER_NOISE_PER_TILE` cells per tile.
 */
export const RIVER_COLOR = 0xcce9ff;
export const RIVER_ALPHA = 0.5;
export const RIVER_NOISE_PER_TILE = 6;
export const RIVER_SPEED_TURNS_PER_SECOND = 0.8;
/** How many periods the crests lag at the banks (at 1x of the debug knob), so a crest bows downstream in the middle. */
const RIVER_ARC_PERIODS = 0.35;

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

let sharedGlProgram: GlProgram | null = null;
function riverGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: WATER_VERTEX, fragment: RIVER_FRAGMENT, name: 'river' });
  return sharedGlProgram;
}

export class RiverFlowMesh {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private readonly geometry: MeshGeometry;
  private hasRiver = false;

  constructor(tileWidth: number, tileHeight: number) {
    const [riverR, riverG, riverB] = hexToRgb01(RIVER_COLOR);
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uGroundSquash: { value: groundSquash(tileWidth, tileHeight), type: 'f32' },
      // The water mask's world rect: (minX, minY, 1 / width, 1 / height).
      uMaskRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
      uShowRiverFlow: { value: 0, type: 'f32' },
      uRiverStyle: { value: 0, type: 'f32' },
      // The river flow texture's own world rect: (minX, minY, 1 / width, 1 / height).
      uRiverRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
      uRiverSpeed: { value: RIVER_SPEED_TURNS_PER_SECOND * 2 * Math.PI, type: 'f32' },
      uRiverArc: { value: RIVER_ARC_PERIODS, type: 'f32' },
      uRiverStreakMix: { value: 0.4, type: 'f32' },
      uRiverAlpha: { value: RIVER_ALPHA, type: 'f32' },
      uRiverColor: { value: new Float32Array([riverR, riverG, riverB]), type: 'vec3<f32>' },
      uRiverScale: { value: RIVER_NOISE_PER_TILE / tileWidth, type: 'f32' },
    });

    this.geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    this.mesh = new Mesh({
      geometry: this.geometry,
      shader: new Shader({
        glProgram: riverGlProgram(),
        resources: {
          riverUniforms: this.uniforms,
          uWaterMask: placeholderDryTexture().source,
          uRiverFlow: placeholderDryTexture().source,
          uRiverPsi: placeholderDryTexture().source,
          uNoiseLattice: noiseLatticeTexture().source,
        },
      }),
    });
    this.mesh.eventMode = 'none';
    this.mesh.visible = false;
  }

  /** Binds the water mask the river is drawn against (only where it says land) and the world rect it was baked over. */
  setMask(source: TextureSource, rect: Rect): void {
    this.mesh.shader!.resources.uWaterMask = source;
    this.uniforms.uniforms.uMaskRect = new Float32Array([rect.minX, rect.minY, 1 / (rect.maxX - rect.minX), 1 / (rect.maxY - rect.minY)]);
  }

  /**
   * Binds the river flow texture (`RiverFlowLayer.texture`), its stream function texture and the world rect they cover
   * (`RiverFlowLayer.rect`), and puts the quad on that rect. `null` hides the mesh again. The textures are owned by the caller, not
   * destroyed here.
   */
  setRiverFlowTexture(texture: Texture | null, rect: Rect | null = null, psi: Texture | null = null): void {
    this.hasRiver = texture !== null && rect !== null;
    this.mesh.shader!.resources.uRiverFlow = (texture ?? placeholderDryTexture()).source;
    this.mesh.shader!.resources.uRiverPsi = (texture && psi ? psi : placeholderDryTexture()).source;
    const r = texture && rect ? rect : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    this.uniforms.uniforms.uRiverRect = new Float32Array([r.minX, r.minY, 1 / (r.maxX - r.minX), 1 / (r.maxY - r.minY)]);
    const positions = this.geometry.getBuffer('aPosition');
    positions.data.set([r.minX, r.minY, r.maxX, r.minY, r.maxX, r.maxY, r.minX, r.maxY]);
    positions.update();
  }

  /**
   * Syncs the debug flags onto uniforms and the water layer's clock. `active` is whether the water mesh itself is drawing (flag on,
   * mask baked, not suppressed); the river adds its own flags and having a river texture.
   */
  tick(clock: number, active: boolean): void {
    const u = this.uniforms.uniforms;
    u.uTime = clock;
    u.uShowRiverFlow = waterDebugFlags.showRiverFlow ? 1 : 0;
    u.uRiverStyle = waterDebugFlags.riverStyle;
    u.uRiverAlpha = RIVER_ALPHA * waterDebugTuning.riverBrightness;
    u.uRiverSpeed = RIVER_SPEED_TURNS_PER_SECOND * 2 * Math.PI * waterDebugTuning.riverSpeed;
    u.uRiverArc = RIVER_ARC_PERIODS * waterDebugTuning.riverArc;
    u.uRiverStreakMix = waterDebugTuning.riverStreakMix;
    // The mask debug view replaces the whole water drawing, rivers included.
    this.mesh.visible = active && this.hasRiver && !waterDebugFlags.showWaterMask && (waterDebugFlags.riverFlow || waterDebugFlags.showRiverFlow);
  }

  destroy(): void {
    this.mesh.destroy();
  }
}

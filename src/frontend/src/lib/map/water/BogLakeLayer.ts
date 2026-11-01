// The bog lake gust mesh — docs/design/water-shader.md, "Bog lakes — gusts in step with the forest". A world-space quad over the lakes'
// bounding rect, sampling the lake wet mask (WaterDryLayer 'lake', one render texture) with matching UVs, like WaterLayer's mesh.
import { GlProgram, Mesh, MeshGeometry, Shader, UniformGroup, type Texture } from 'pixi.js';
import { BOG_LAKE_FRAGMENT, BOG_LAKE_VERTEX } from './bogLakeShader';
import { GUST_PEAK_PHASE, gustTime } from './bogLakeGust';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import { placeholderDryTexture } from './WaterLayer';

let sharedGlProgram: GlProgram | null = null;
function bogLakeGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: BOG_LAKE_VERTEX, fragment: BOG_LAKE_FRAGMENT, name: 'bog-lake' });
  return sharedGlProgram;
}

export class BogLakeLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private readonly geometry: MeshGeometry;
  private hasLake = false;
  private suppressed = false;
  private frozen = false;
  // The clock the shader last got; while frozen it stays put, so the gust holds its pose.
  private clockMs = 0;

  constructor(tileWidth: number) {
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uGustTime: { value: 0, type: 'f32' },
      uTileW: { value: tileWidth, type: 'f32' },
      uGustPeak: { value: GUST_PEAK_PHASE, type: 'f32' },
      uRuffle: { value: 0, type: 'f32' },
      uGlints: { value: 0, type: 'f32' },
    });
    this.geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({
      geometry: this.geometry,
      shader: new Shader({ glProgram: bogLakeGlProgram(), resources: {
          bogLakeUniforms: this.uniforms,
          // Declared up front: Pixi binds only the resources a shader is built with, so a sampler first assigned in setLake would never be
          // bound and would read whatever texture unit 0 holds — the gust then shades the whole quad, bog and all, not just the lake.
          uLakeMask: placeholderDryTexture().source,
        },
      }),
    });
    this.mesh.eventMode = 'none';
    this.mesh.visible = false;
  }

  /**
   * Binds the lake mask render texture (`WaterDryLayer('lake').texture`) and moves the quad onto the world `rect` it was drawn over. `null`
   * (no lakes in view) hides the layer. The texture is owned by the caller.
   */
  setLake(texture: Texture | null, rect: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
    this.hasLake = texture !== null && rect !== null;
    this.mesh.shader!.resources.uLakeMask = (texture ?? placeholderDryTexture()).source;
    if (!rect) return;
    const { minX, minY, maxX, maxY } = rect;
    const positions = this.geometry.getBuffer('aPosition');
    positions.data.set([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    positions.update();
  }

  /** Hides the layer where the water is hidden (see WaterLayer.setSuppressed). */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  /** Freezes (or resumes) the gust: the layer keeps drawing, its clock just stops (see WaterLayer.setFrozen). */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** Syncs the debug flags onto uniforms and takes the forests' animation clock (`animClockMs`, so the gust shares their phase). Once a frame. */
  tick(animClockMs: number): void {
    if (!this.frozen) this.clockMs = animClockMs;
    const u = this.uniforms.uniforms;
    u.uTime = this.clockMs / 1000;
    u.uGustTime = gustTime(this.clockMs);
    u.uRuffle = waterDebugFlags.bogLakeRuffle ? waterDebugTuning.bogLakeRuffleStrength : 0;
    u.uGlints = waterDebugFlags.bogLakeGlints ? waterDebugTuning.bogLakeGlintStrength : 0;
    this.mesh.visible = waterDebugFlags.water && this.hasLake && !this.suppressed;
  }

  destroy(): void {
    this.mesh.destroy();
  }
}

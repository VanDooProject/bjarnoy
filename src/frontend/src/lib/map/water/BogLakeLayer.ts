// The bog lake gust mesh — docs/design/water-shader.md, "Bog lakes — gusts in step with the forest". A world-space quad over the lakes'
// bounding rect, sampling the lake wet mask (WaterDryLayer 'lake', one render texture) with matching UVs, like WaterLayer's mesh.
import { BlurFilter, Container, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Sprite, UniformGroup, type Renderer, type Texture } from 'pixi.js';
import { BOG_LAKE_FRAGMENT, BOG_LAKE_VERTEX } from './bogLakeShader';
import { GUST_PEAK_PHASE, gustTime } from './bogLakeGust';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import { placeholderDryTexture } from '../shaderResources';

let sharedGlProgram: GlProgram | null = null;
function bogLakeGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: BOG_LAKE_VERTEX, fragment: BOG_LAKE_FRAGMENT, name: 'bog-lake' });
  return sharedGlProgram;
}

/** Blur strength (px, in the mask's 1 px per world unit) that turns the lake mask into the shore band's distance-like field. */
export const SHORE_BLUR_STRENGTH = 6;
const SHORE_BLUR_QUALITY = 3;

export class BogLakeLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private readonly geometry: MeshGeometry;
  // The shore water (setLake) blurred, the lake mask's size: the shader reads the distance to the shore off it. Redrawn in setLake, never per frame.
  private shoreTarget: RenderTexture | null = null;
  private readonly shoreContainer = new Container();
  private readonly shoreSprites: Sprite[] = [];
  private hasLake = false;
  private suppressed = false;
  // "Lake motion" off (the player's setting, or the device's reduced-motion setting under 'auto'): the whole layer (gusts, blops) is hidden, not frozen. A frozen gust is a band of foam and dark patches standing still on the lake, which reads as a rendering
  // fault rather than calm water.
  private motionOff = false;

  constructor(tileWidth: number) {
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uGustTime: { value: 0, type: 'f32' },
      uTileW: { value: tileWidth, type: 'f32' },
      uGustPeak: { value: GUST_PEAK_PHASE, type: 'f32' },
      uBandHalf: { value: 0, type: 'f32' },
      uFoam: { value: 0, type: 'f32' },
      uSheen: { value: 0, type: 'f32' },
      uCatsPaws: { value: 0, type: 'f32' },
      uFoamWidth: { value: 0, type: 'f32' },
      uFoamSpacing: { value: 0, type: 'f32' },
      uFoamStyle: { value: 0, type: 'f32' },
      uLakeOrigin: { value: new Float32Array(2), type: 'vec2<f32>' },
      uLakeSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uBlops: { value: 0, type: 'f32' },
      uBlopDensity: { value: 1, type: 'f32' },
      uBlopSize: { value: 1, type: 'f32' },
      uShore: { value: 0, type: 'f32' },
      uShoreEdge: { value: 0, type: 'f32' },
      uShoreWobble: { value: 0, type: 'f32' },
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
          uShoreMask: placeholderDryTexture().source,
        },
      }),
    });
    this.shoreContainer.filters = [new BlurFilter({ strength: SHORE_BLUR_STRENGTH, quality: SHORE_BLUR_QUALITY })];
    this.mesh.eventMode = 'none';
    this.mesh.visible = false;
  }

  /**
   * Binds the lake mask render texture (`WaterDryLayer('lake').texture`) and moves the quad onto the world `rect` it was drawn over. `null`
   * (no lakes in view) hides the layer. The textures are owned by the caller. `shoreWater` (same rect and size as `texture`) is the water
   * the shore band is measured from: the lakes without their lily pads and reed islands cut out (`'lakeShore'`), so only the land shore
   * gets the band, and the lake mouths' creek water (`'river'`), so a creek meeting the lake is no shore. `renderer` blurs it into the
   * texture the shader reads the shore distance from; it is only used (and may be null) when a texture is given.
   */
  setLake(
    renderer: Renderer | null,
    texture: Texture | null,
    rect: { minX: number; minY: number; maxX: number; maxY: number } | null,
    shoreWater: readonly Texture[] = [],
  ): void {
    this.hasLake = texture !== null && rect !== null;
    this.mesh.shader!.resources.uLakeMask = (texture ?? placeholderDryTexture()).source;
    const shore = texture && renderer ? this.drawShore(renderer, texture, shoreWater) : null;
    this.mesh.shader!.resources.uShoreMask = (shore ?? placeholderDryTexture()).source;
    if (!rect) return;
    const { minX, minY, maxX, maxY } = rect;
    // The shader maps world positions onto the mask itself (shore bank distance, blop spots): its rect, not just vUV.
    const u = this.uniforms.uniforms;
    u.uLakeOrigin = new Float32Array([minX, minY]);
    u.uLakeSize = new Float32Array([Math.max(maxX - minX, 1), Math.max(maxY - minY, 1)]);
    const positions = this.geometry.getBuffer('aPosition');
    positions.data.set([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    positions.update();
  }

  /** Blurs the shore water into the shore render texture (the lake mask's size, resized in place). Runs when the mask is redrawn. */
  private drawShore(renderer: Renderer, mask: Texture, shoreWater: readonly Texture[]): Texture {
    const { width, height } = mask;
    if (!this.shoreTarget) {
      this.shoreTarget = RenderTexture.create({ width, height, resolution: 1, scaleMode: 'linear' });
    } else if (this.shoreTarget.width !== width || this.shoreTarget.height !== height) {
      this.shoreTarget.source.resize(width, height, 1);
    }
    shoreWater.forEach((water, i) => {
      const sprite = (this.shoreSprites[i] ??= new Sprite());
      sprite.texture = water;
      sprite.width = width;
      sprite.height = height;
      if (!sprite.parent) this.shoreContainer.addChild(sprite);
    });
    for (let i = shoreWater.length; i < this.shoreSprites.length; i++) this.shoreSprites[i]!.removeFromParent();
    renderer.render({ container: this.shoreContainer, target: this.shoreTarget, clear: true, clearColor: [0, 0, 0, 0] });
    return this.shoreTarget;
  }

  /** Hides the layer where the water is hidden (see WaterLayer.setSuppressed). */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  /** The "Lake motion" setting (`HexMapRenderer.setLakeMotion`): off hides all lake motion (gusts, blops) until it is back on. */
  setMotion(enabled: boolean): void {
    this.motionOff = !enabled;
  }

  /** Syncs the debug flags onto uniforms and takes the forests' animation clock (`animClockMs`, so the gust shares their phase). Once a frame. */
  tick(animClockMs: number): void {
    const u = this.uniforms.uniforms;
    u.uTime = animClockMs / 1000;
    u.uGustTime = gustTime(animClockMs);
    u.uFoam = waterDebugFlags.bogLakeFoam ? waterDebugTuning.bogLakeFoamStrength : 0;
    u.uSheen = waterDebugFlags.bogLakeSheen ? waterDebugTuning.bogLakeSheenStrength : 0;
    u.uCatsPaws = waterDebugFlags.bogLakeCatsPaws ? waterDebugTuning.bogLakeCatsPawsStrength : 0;
    u.uBlops = waterDebugFlags.bogLakeBlops ? waterDebugTuning.bogLakeBlopsStrength : 0;
    u.uShore = waterDebugFlags.bogLakeShore ? waterDebugTuning.bogLakeShoreStrength : 0;
    u.uShoreEdge = waterDebugTuning.bogLakeShoreEdge;
    u.uShoreWobble = waterDebugTuning.bogLakeShoreWobble;
    u.uBlopDensity = waterDebugTuning.bogLakeBlopDensity;
    u.uBlopSize = waterDebugTuning.bogLakeBlopSize;
    u.uFoamWidth = waterDebugTuning.bogLakeFoamWidth;
    u.uFoamSpacing = waterDebugTuning.bogLakeFoamSpacing;
    u.uFoamStyle = waterDebugTuning.bogLakeFoamStyle;
    u.uBandHalf = waterDebugTuning.bogLakeBandHalf;
    u.uGustPeak = GUST_PEAK_PHASE + waterDebugTuning.bogLakeGustPhaseOffset;
    this.mesh.visible = waterDebugFlags.water && this.hasLake && !this.suppressed && !this.motionOff;
  }

  destroy(): void {
    this.mesh.destroy();
    for (const sprite of this.shoreSprites) sprite.destroy();
    this.shoreContainer.destroy();
    this.shoreTarget?.destroy(true);
    this.shoreTarget = null;
  }
}

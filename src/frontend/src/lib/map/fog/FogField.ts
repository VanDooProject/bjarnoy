// The fog's shared field (docs/design/map-fog-v2.md, "Shared field"): ONE pass of the fog shader (fogShader.ts's
// FOG_FIELD_FRAGMENT: mask, cross-fade, army vision, edge noise, drift) into a world-anchored RenderTexture with
// R = out-of-sight tier alpha and G = unknown tier alpha. The two stage quads (FogMaskLayer) only sample it. It is
// re-rendered only when fogFieldPlan.ts's fogFieldRenderReason says so, not every frame. Two snapshots are kept (previous
// and newest) so the periodic drift render does not make the edge jump: see `update`.
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, UniformGroup, type Renderer } from 'pixi.js';
import { noiseLatticeTexture } from '../shaderNoise';
import { FOG_FIELD_FRAGMENT, FOG_VERTEX, MAX_ARMY_VISION_SOURCES } from './fogShader';
import {
  ARMY_FOG_BLACK_MARGIN,
  ARMY_FOG_BLACK_OFFSET,
  ARMY_FOG_WHITE_MARGIN,
  ARMY_FOG_WHITE_OFFSET,
  fullscreenGeometry,
  type ArmyVisionSource,
} from './FogMaskLayer';
import { NOISE_REACH } from './fogRamp';
import {
  driftBlendWeight,
  driftRenderPhase,
  fieldTargetSize,
  fieldWorldRect,
  fogFieldRenderReason,
  type FogCamera,
  type FogFieldRendered,
  type FogViewport,
} from './fogFieldPlan';

/** How long a newly-set mask texture takes to fully cross-fade in (§2.6). */
const REVEAL_FADE_MS = 600;

// --- Vision-edge shaping (fogShader.ts's tierAlpha) ------------------------
//
// Everything below is in *ramp units*: 0 is the tier's own ring, 1 is the
// generator's full margin for that tier — 14 hexes for unknown
// (UNKNOWN_RAMP_MARGIN_HEXES in fogRamp.ts, which
// FogMaskOptions.UnknownMarginHexes has to equal), 2 for
// out-of-sight. So 0.1 of the unknown ramp is 1.4 hexes, and 0.1 of the
// out-of-sight ramp is a fifth of one.

/**
 * Where the never-scouted mist starts (x) and reaches full opacity (y).
 * Half a hex past the explored ring to just under six: wide enough that the frayed,
 * fading part of the mist is a band you can read as weather rather than a
 * rim around the realm, and (with EDGE_NOISE below) the outermost wisps
 * carry a good deal further than `y` itself. Past the point where the noise
 * window closes the mist is fully opaque and stays that way — deep fog is
 * not supposed to be see-through.
 *
 * Not the raw 0→10-hex ramp the mask bakes, though: that is a linear
 * airbrush hundreds of pixels deep with no edge in it to make organic at
 * all, and it never reaches full opacity inside the terrain cull radius.
 */
const UNKNOWN_EDGE: [number, number] = [0.04, 0.42];
/**
 * Same for the scouted-but-out-of-sight tint, over its own 2-hex ramp: a
 * third of a hex past the line-of-sight ring to one and two thirds, so the
 * grey band lands inside the explored ring (WorldModel's FOG_SCOUT_RING)
 * rather than washing over the mist beyond it.
 */
const OUT_OF_SIGHT_EDGE: [number, number] = [0.15, 0.85];
// NOISE_REACH and FOG_MIST_OPAQUE_AT_RAMP live in fogRamp.ts (no pixi there, so FogCoverage and the store can read them).
/**
 * Peak-to-peak displacement of each tier's edge by the drifting cloud field
 * — [unknown, outOfSight]. 0.46 of the unknown ramp is ±3.2 hexes, several
 * times the one-hex spacing of the mask's integer `hexDistance` contours,
 * which is what stops those hexagonal rings being legible as straight
 * edges at all. It is also what makes the edge *fluffy* rather than merely
 * wavy: at this amplitude the noise tears the boundary into overlapping
 * banks and detached wisps instead of displacing one continuous line.
 */
const EDGE_NOISE: [number, number] = [0.46, 0.4];
/**
 * Displacement by the mask's baked per-hex seed (§2.2's B channel), same
 * units. Deliberately well under EDGE_NOISE — this adds per-hex grain to
 * the edge, but pushed further it starts re-imposing the hex silhouette the
 * cloud noise exists to break.
 */
const SEED_JITTER: [number, number] = [0.1, 0.14];
/**
 * How far the second cloud layer is allowed to thin each tier where the
 * noise window is open — [unknown, outOfSight], as a fraction of the tier's
 * own opacity. Displacing the ramp threshold alone leaves a *hard* edge
 * however irregular its outline, because every pixel ends up on one side of
 * the ramp or the other; this is what puts soft gradients inside the frayed
 * silhouette. Bounded well below 1 so the band thins rather than tearing
 * open, and windowed to zero at the ramp's ends like everything else here,
 * so it can never touch the deep mist.
 */
const EDGE_SOFTNESS: [number, number] = [0.45, 0.3];
/**
 * Reciprocal of the cloud field's largest feature size, in world units.
 * TILE_W is 168 world units, so 1/900 puts the coarsest billow at ~5.4
 * hexes and (three octaves at ~2x each, see fogShader.ts's fbm()) the
 * finest wisps at about 1.3. The coarse end is what makes the edge read as
 * *soft*: a large feature is a shallow gradient, and it is the gradient of
 * the noise, not its amplitude, that decides how abruptly the mist opens
 * up. main's #168 kept 1/620 against three octaves; this branch widened the
 * field to 1/900 for the broader fluffy band, so the same octave count
 * lands on coarser detail here by design.
 */
const NOISE_SCALE = 1 / 900;
/**
 * Cloud drift, in noise-space units per second — divide by NOISE_SCALE for
 * world units, so this is ~45 × ~27 world units/s, about one hex every three
 * and a half seconds diagonally. Slow enough to read as weather rather than
 * a scrolling texture, fast enough that the edge visibly moves while you
 * look at it — the shipped values were ~30x slower than this *and* attached
 * to a displacement ~40x smaller (see fogShader.ts's header), which
 * together is why the drift appeared not to run at all.
 *
 * FogDebugPanel's drift-speed slider scales this live (see `tick`), so it
 * can be re-judged by eye without a rebuild.
 */
const WIND: [number, number] = [0.05, -0.03];

let sharedGlProgram: GlProgram | null = null;
function fogFieldGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: FOG_VERTEX, fragment: FOG_FIELD_FRAGMENT, name: 'fog-field' });
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

/**
 * World-to-mask-UV affine (map-fog-v2.md §2.1) plus the mask's own texel
 * dimensions — everything FogField needs to place a fetched texture
 * correctly, computed by the caller from `worldMaskBounds` (fogMaskLayout.ts)
 * and the isoGridPosition-derived tile constants (TILE_W/TILE_H).
 */
export interface FogMaskPlacement {
  scale: [number, number];
  offset: [number, number];
}


export class FogField {
  /**
   * The two field snapshots the composite quads sample (slots A and B; `newest` says which one the last render went
   * into). Resized in place, so a shader can stay bound to its source.
   */
  readonly textures: readonly [RenderTexture, RenderTexture];
  /**
   * What the composite quads need to place the field (shared by both of them): the screen -> world inputs (camera,
   * viewport), the world rect each snapshot covers, the weight of snapshot B and the debug-view switch.
   */
  readonly compositeUniforms: UniformGroup;
  private readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup;
  private fadeStartedAt: number | null = null;
  private fadeFromBlend = 0;
  // The cloud field's own clock, accumulated rather than read off performance.now() — see `tick`.
  private driftPhase = 0;
  private lastTickAtMs: number | null = null;
  private camera: FogCamera = { x: 0, y: 0, zoom: 1 };
  private viewport: FogViewport = { width: 0, height: 0 };
  private rendered: FogFieldRendered | null = null;
  private dirty = true;
  private fading = false;
  private drifting = false;
  private nowMs = 0;
  private driftSpeed = 1;
  // Which slot the last render went into, and whether the composite shows only that one (anything but a drift render).
  private newest: 0 | 1 = 0;
  private aliased = true;
  private debugKey = '';
  private armyKey = '';

  constructor() {
    this.uniforms = new UniformGroup({
      uFieldOrigin: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uFieldSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uWorldToMaskScale: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uWorldToMaskOffset: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uWorldToMaskScalePrev: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uWorldToMaskOffsetPrev: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uUnknownEdge: { value: new Float32Array(UNKNOWN_EDGE), type: 'vec2<f32>' },
      uOutOfSightEdge: { value: new Float32Array(OUT_OF_SIGHT_EDGE), type: 'vec2<f32>' },
      uNoiseReach: { value: new Float32Array(NOISE_REACH), type: 'vec2<f32>' },
      uEdgeNoise: { value: new Float32Array(EDGE_NOISE), type: 'vec2<f32>' },
      uSeedJitter: { value: new Float32Array(SEED_JITTER), type: 'vec2<f32>' },
      uEdgeSoftness: { value: new Float32Array(EDGE_SOFTNESS), type: 'vec2<f32>' },
      uNoiseScale: { value: NOISE_SCALE, type: 'f32' },
      uTime: { value: 0, type: 'f32' },
      uWind: { value: new Float32Array(WIND), type: 'vec2<f32>' },
      uMaskBlend: { value: 1, type: 'f32' },
      uShowRaw: { value: 0, type: 'f32' },
      uShowEffective: { value: 0, type: 'f32' },
      // `size` is what makes this an *array* uniform. Pixi defaults it to 1
      // (UniformGroup), and a size-1 vec2 syncs through gl.uniform2f(v[0],
      // v[1]) — only the first point ever reaches the GPU, leaving the
      // shader's remaining `uArmyVisionSources` slots at their default (0,0).
      // With one army in transit that is invisible; the second one reads slot
      // 1 and punches a full-strength reveal disc at world origin, nowhere
      // near any army. Declaring the size switches the sync to uniform2fv,
      // which uploads the whole array.
      uArmyVisionSources: {
        value: new Float32Array(MAX_ARMY_VISION_SOURCES * 2),
        type: 'vec2<f32>',
        size: MAX_ARMY_VISION_SOURCES,
      },
      // One vision radius (hexes) per source slot, same index as `uArmyVisionSources`; `size` for the same reason as above.
      uArmyVisionRadii: {
        value: new Float32Array(MAX_ARMY_VISION_SOURCES),
        type: 'f32',
        size: MAX_ARMY_VISION_SOURCES,
      },
      uArmyVisionCount: { value: 0, type: 'f32' },
      uArmyHexSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      // Offsets and margins relative to each source's own radius (the ARMY_FOG_* constants): fixed, set once.
      uArmyRamp: {
        value: new Float32Array([ARMY_FOG_BLACK_OFFSET, ARMY_FOG_BLACK_MARGIN, ARMY_FOG_WHITE_OFFSET, ARMY_FOG_WHITE_MARGIN]),
        type: 'vec4<f32>',
      },
    });

    this.compositeUniforms = new UniformGroup({
      uCameraPos: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uZoom: { value: 1, type: 'f32' },
      uViewport: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uFieldOriginA: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uFieldSizeA: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uFieldOriginB: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uFieldSizeB: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uFieldBlendB: { value: 0, type: 'f32' },
      uDebugView: { value: 0, type: 'f32' },
    });

    const target = () => RenderTexture.create({ width: 1, height: 1, resolution: 1, scaleMode: 'linear' });
    this.textures = [target(), target()];

    const shader = new Shader({
      glProgram: fogFieldGlProgram(),
      resources: {
        fogUniforms: this.uniforms,
        uMask: placeholderTexture().source,
        uMaskPrev: placeholderTexture().source,
        uNoiseLattice: noiseLatticeTexture().source,
      },
    });
    this.mesh = new Mesh({ geometry: fullscreenGeometry(), shader });
    // The field pass overwrites the cleared target; blending with it would only add cost.
    this.mesh.blendMode = 'none';
  }

  /** Called on every camera change — cheap; whether it forces a render is decided in `update`. */
  setCamera(camera: FogCamera, viewport: FogViewport): void {
    if (viewport.width !== this.viewport.width || viewport.height !== this.viewport.height) this.dirty = true;
    this.camera = { x: camera.x, y: camera.y, zoom: camera.zoom };
    this.viewport = { width: viewport.width, height: viewport.height };
    const cameraPos = this.compositeUniforms.uniforms.uCameraPos as Float32Array;
    cameraPos[0] = camera.x;
    cameraPos[1] = camera.y;
    this.compositeUniforms.uniforms.uZoom = camera.zoom;
    const vp = this.compositeUniforms.uniforms.uViewport as Float32Array;
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
    this.dirty = true;
  }

  /**
   * §1c: uploads this frame's live army vision sources — world-space points,
   * already resolved by HexMapRenderer from its own army render-position
   * tracking, each with its own vision radius in hexes, plus the world-unit
   * size of one hex step (`hexSize`, which makes the shader's distance
   * hex-euclidean). The shader turns each radius R into the troop's two ramps
   * (black from R + ARMY_FOG_BLACK_OFFSET over ARMY_FOG_BLACK_MARGIN hexes,
   * white from R + ARMY_FOG_WHITE_OFFSET over ARMY_FOG_WHITE_MARGIN hexes) and
   * min()s them with the mask. Called every tick, never gated on a mask fetch:
   * this is the whole point of keeping §1c out of the cached texture. The field
   * is only marked for a re-render when the sources actually differ from the
   * last call. Silently truncates past `MAX_ARMY_VISION_SOURCES`.
   */
  setArmyVisionSources(sources: readonly ArmyVisionSource[], hexSize: { x: number; y: number }): void {
    const points = this.uniforms.uniforms.uArmyVisionSources as Float32Array;
    const radii = this.uniforms.uniforms.uArmyVisionRadii as Float32Array;
    const count = Math.min(sources.length, MAX_ARMY_VISION_SOURCES);
    let key = `${count}|${hexSize.x}|${hexSize.y}`;
    for (let i = 0; i < count; i++) {
      points[i * 2] = sources[i].x;
      points[(i * 2) + 1] = sources[i].y;
      radii[i] = sources[i].radiusHexes;
      key += `|${sources[i].x},${sources[i].y},${sources[i].radiusHexes}`;
    }
    this.uniforms.uniforms.uArmyVisionCount = count;
    const size = this.uniforms.uniforms.uArmyHexSize as Float32Array;
    size[0] = hexSize.x;
    size[1] = hexSize.y;
    if (key !== this.armyKey) {
      this.armyKey = key;
      this.dirty = true;
    }
  }

  /**
   * Swaps in a freshly-fetched mask texture, keeping the previous one bound
   * as `uMaskPrev` and animating `uMaskBlend` 0→1 over REVEAL_FADE_MS — §2.6's
   * reveal cross-fade, shared by a settlement's founding reveal and a mask
   * simply finishing a fetch after a moment of default-unknown.
   */
  setMaskTexture(texture: Texture, placement?: FogMaskPlacement): void {
    const shader = this.mesh.shader!;
    // The texture being replaced keeps the placement it was uploaded with, so
    // the cross-fade samples both generations where each actually sits — the
    // mask is a chunk window that moves with the camera (fogChunks.ts), and
    // sampling the old one through the new placement would smear it.
    const scale = this.uniforms.uniforms.uWorldToMaskScale as Float32Array;
    const offset = this.uniforms.uniforms.uWorldToMaskOffset as Float32Array;
    const scalePrev = this.uniforms.uniforms.uWorldToMaskScalePrev as Float32Array;
    const offsetPrev = this.uniforms.uniforms.uWorldToMaskOffsetPrev as Float32Array;
    scalePrev[0] = scale[0];
    scalePrev[1] = scale[1];
    offsetPrev[0] = offset[0];
    offsetPrev[1] = offset[1];
    if (placement) this.setPlacement(placement);

    shader.resources.uMaskPrev = shader.resources.uMask;
    shader.resources.uMask = texture.source;
    this.fadeStartedAt = performance.now();
    this.fadeFromBlend = 0;
    this.uniforms.uniforms.uMaskBlend = 0;
    this.dirty = true;
  }

  /**
   * §2.8's real (functional, not cosmetic) debug toggles: `warp` zeroes both
   * edge-noise amplitudes, leaving the mask's raw `hexDistance` ramp to
   * shape the boundary on its own. `showRawMask` bypasses the edge shaping and
   * tier compositing, rendering the fetched mask texture unmodified;
   * `showEffectiveMask` dumps the mask channels after the §1c army-vision ramps.
   * Both debug views are written into the field's RGB and shown as-is by
   * whichever tier quads are visible.
   */
  setDebug(opts: { warpEnabled: boolean; showRawMask: boolean; showEffectiveMask: boolean }): void {
    const key = `${opts.warpEnabled}|${opts.showRawMask}|${opts.showEffectiveMask}`;
    if (key === this.debugKey) return;
    this.debugKey = key;
    const edgeNoise = this.uniforms.uniforms.uEdgeNoise as Float32Array;
    edgeNoise[0] = opts.warpEnabled ? EDGE_NOISE[0] : 0;
    edgeNoise[1] = opts.warpEnabled ? EDGE_NOISE[1] : 0;
    const seedJitter = this.uniforms.uniforms.uSeedJitter as Float32Array;
    seedJitter[0] = opts.warpEnabled ? SEED_JITTER[0] : 0;
    seedJitter[1] = opts.warpEnabled ? SEED_JITTER[1] : 0;
    this.uniforms.uniforms.uShowRaw = opts.showRawMask ? 1 : 0;
    this.uniforms.uniforms.uShowEffective = opts.showEffectiveMask ? 1 : 0;
    this.compositeUniforms.uniforms.uDebugView = opts.showRawMask || opts.showEffectiveMask ? 1 : 0;
    this.dirty = true;
  }

  /**
   * Advances the cloud field's animation clock and the reveal cross-fade, if
   * one is running.
   *
   * `uTime` accumulates elapsed time scaled by `speed` rather than being set
   * to the raw clock, for two reasons. The drift toggle (§2.8) can freeze
   * and resume the edge without it jumping forward by however long it was
   * paused; and FogDebugPanel's speed slider changes the *rate* from
   * wherever the pattern currently is, instead of rescaling the whole
   * elapsed clock and teleporting the fog on every drag of the handle.
   */
  tick(nowMs: number, driftEnabled: boolean, speed = 1): void {
    const sinceLast = this.lastTickAtMs === null ? 0 : nowMs - this.lastTickAtMs;
    this.lastTickAtMs = nowMs;
    this.nowMs = nowMs;
    this.drifting = driftEnabled;
    this.driftSpeed = speed;
    if (driftEnabled) this.driftPhase += (sinceLast / 1000) * speed;

    this.fading = false;
    if (this.fadeStartedAt === null) return;
    // Latched, not just the per-frame `fading` flag: update() is not called while the fog quads are hidden, and the
    // frame that lands blend == 1 must still be rendered once they show again.
    this.dirty = true;
    const t = Math.min(1, (nowMs - this.fadeStartedAt) / REVEAL_FADE_MS);
    this.uniforms.uniforms.uMaskBlend = this.fadeFromBlend + (1 - this.fadeFromBlend) * t;
    // The frame that lands blend == 1 still has to be rendered, so it counts as fading too.
    this.fading = true;
    if (t >= 1) this.fadeStartedAt = null;
  }

  /**
   * Re-renders the field if this frame needs a fresh one (fogFieldRenderReason); otherwise the quads keep sampling the
   * existing snapshots. Returns whether it rendered. Call after `setCamera`/`tick`. Also moves the composite's blend
   * weight every call.
   *
   * Smooth drift: a periodic drift render goes into the slot that is not the newest one and is rendered one drift
   * interval ahead (driftRenderPhase); the composite then fades from the previous snapshot to it over the next interval
   * (driftBlendWeight), reaching it just as the next render replaces it. Any other render (first, an input changed,
   * camera, army sources, reveal fade) shows only itself, rendered at the current drift phase, so nothing lags or ghosts
   * however often it repeats.
   */
  update(renderer: Renderer): boolean {
    const { viewport, camera } = this;
    if (viewport.width <= 0 || viewport.height <= 0) return false;
    const reason = fogFieldRenderReason({
      rendered: this.rendered,
      camera,
      viewport,
      nowMs: this.nowMs,
      dirty: this.dirty,
      fading: this.fading,
      drifting: this.drifting,
    });
    if (reason === 'none') {
      this.applyBlend();
      return false;
    }

    const size = fieldTargetSize(viewport);
    for (const texture of this.textures) {
      if (texture.width !== size.width || texture.height !== size.height) texture.source.resize(size.width, size.height, 1);
    }
    const rect = fieldWorldRect(camera, viewport);
    const slot: 0 | 1 = this.newest === 0 ? 1 : 0;
    const set = (group: UniformGroup, originName: string, sizeName: string) => {
      const origin = group.uniforms[originName] as Float32Array;
      origin[0] = rect.x;
      origin[1] = rect.y;
      const span = group.uniforms[sizeName] as Float32Array;
      span[0] = rect.w;
      span[1] = rect.h;
    };
    set(this.uniforms, 'uFieldOrigin', 'uFieldSize');
    set(this.compositeUniforms, slot === 0 ? 'uFieldOriginA' : 'uFieldOriginB', slot === 0 ? 'uFieldSizeA' : 'uFieldSizeB');
    // Not drifting: uTime stays where the last render left it, matching what is on screen.
    if (this.drifting) {
      this.uniforms.uniforms.uTime = reason === 'drift' ? driftRenderPhase(this.driftPhase, this.driftSpeed) : this.driftPhase;
    }
    renderer.render({ container: this.mesh, target: this.textures[slot], clear: true, clearColor: [0, 0, 0, 0] });
    this.newest = slot;
    this.aliased = reason !== 'drift';
    this.rendered = { rect, zoom: camera.zoom, atMs: this.nowMs };
    this.dirty = false;
    this.applyBlend();
    return true;
  }

  /** Sets the composite's weight of snapshot B: the newest one alone, or the previous-to-newest cross-fade while a drift render is settling in. */
  private applyBlend(): void {
    const showNewestOnly = this.aliased || !this.drifting || this.rendered === null;
    const weightOfNewest = showNewestOnly ? 1 : driftBlendWeight(this.nowMs, this.rendered!.atMs);
    this.compositeUniforms.uniforms.uFieldBlendB = this.newest === 1 ? weightOfNewest : 1 - weightOfNewest;
  }

  destroy(): void {
    this.mesh.destroy();
    for (const texture of this.textures) texture.destroy(true);
  }
}

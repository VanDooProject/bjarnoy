// One of fog v2's two screen-space quads (§4: "black fog" out-of-sight tint,
// "white mist" never-scouted mist) — a Pixi v8 Mesh sampling the fetched
// mask texture through a shared GLSL shader (fogShader.ts). The first
// custom-shader code in this codebase; see HexMapRenderer.ts's own comment
// on how this replaces v1's per-hex blob/pattern-sprite fog entirely.
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import { FOG_FRAGMENT, FOG_VERTEX, MAX_ARMY_VISION_SOURCES } from './fogShader';

export type FogTier = 'outOfSight' | 'unknown';

/** How long a newly-set mask texture takes to fully cross-fade in (§2.6). */
const REVEAL_FADE_MS = 600;

// --- Vision-edge shaping (fogShader.ts's tierAlpha) ------------------------
//
// Everything below is in *ramp units*: 0 is the tier's own ring, 1 is the
// generator's full margin for that tier — 10 hexes for unknown
// (UNKNOWN_MARGIN_HEXES / FogMaskOptions.UnknownMarginHexes), 2 for
// out-of-sight. So 0.1 of the unknown ramp is one hex, and 0.1 of the
// out-of-sight ramp is a fifth of one.

/**
 * Where the never-scouted mist starts (x) and reaches full opacity (y).
 * Half a hex past the explored ring to five: wide enough that the frayed,
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
const UNKNOWN_EDGE: [number, number] = [0.05, 0.5];
/**
 * Same for the scouted-but-out-of-sight tint, over its own 2-hex ramp: a
 * third of a hex past the line-of-sight ring to one and two thirds, so the
 * grey band lands inside the explored ring (WorldModel's FOG_SCOUT_RING)
 * rather than washing over the mist beyond it.
 */
const OUT_OF_SIGHT_EDGE: [number, number] = [0.15, 0.85];
/**
 * Where each tier's edge noise starts tapering off, reaching zero at the end
 * of the ramp — [unknown, outOfSight], and independent of where the tier's
 * opacity saturates (see fogShader.ts's edgeBand). 0.65 of the mist's ramp
 * is six and a half hexes, so wisps keep thinning otherwise-solid mist for
 * a couple of hexes past the point it has gone opaque, which is where the
 * outer, faintest half of the fluff lives.
 */
const NOISE_REACH: [number, number] = [0.65, 0.85];
/**
 * Peak-to-peak displacement of each tier's edge by the drifting cloud field
 * — [unknown, outOfSight]. 0.44 of the unknown ramp is ±2.2 hexes, several
 * times the one-hex spacing of the mask's integer `hexDistance` contours,
 * which is what stops those hexagonal rings being legible as straight
 * edges at all. It is also what makes the edge *fluffy* rather than merely
 * wavy: at this amplitude the noise tears the boundary into overlapping
 * banks and detached wisps instead of displacing one continuous line.
 */
const EDGE_NOISE: [number, number] = [0.44, 0.4];
/**
 * Displacement by the mask's baked per-hex seed (§2.2's B channel), same
 * units. Deliberately well under EDGE_NOISE — this adds per-hex grain to
 * the edge, but pushed further it starts re-imposing the hex silhouette the
 * cloud noise exists to break.
 */
const SEED_JITTER: [number, number] = [0.14, 0.14];
/**
 * Reciprocal of the cloud field's largest feature size, in world units.
 * TILE_W is 168 world units, so 1/620 puts the coarsest billow at ~3.7
 * hexes and (four octaves at ~2× each) the finest wisps at about half a
 * hex — the span the mist needs to read as banks of cloud with detail on
 * them, rather than as one smoothly wobbling outline.
 */
const NOISE_SCALE = 1 / 620;
/**
 * Cloud drift, in noise-space units per second — divide by NOISE_SCALE for
 * world units, so this is ~31 × ~19 world units/s, about one hex every five
 * seconds diagonally. Slow enough to read as weather rather than a scrolling
 * texture, fast enough that the edge visibly moves while you look at it —
 * the shipped values were ~30× slower than this *and* attached to a
 * displacement ~40× smaller (see fogShader.ts's header), which together is
 * why the drift appeared not to run at all.
 */
const WIND: [number, number] = [0.05, -0.03];

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
      uUnknownEdge: { value: new Float32Array(UNKNOWN_EDGE), type: 'vec2<f32>' },
      uOutOfSightEdge: { value: new Float32Array(OUT_OF_SIGHT_EDGE), type: 'vec2<f32>' },
      uNoiseReach: { value: new Float32Array(NOISE_REACH), type: 'vec2<f32>' },
      uEdgeNoise: { value: new Float32Array(EDGE_NOISE), type: 'vec2<f32>' },
      uSeedJitter: { value: new Float32Array(SEED_JITTER), type: 'vec2<f32>' },
      uNoiseScale: { value: NOISE_SCALE, type: 'f32' },
      uTime: { value: 0, type: 'f32' },
      uWind: { value: new Float32Array(WIND), type: 'vec2<f32>' },
      uMaskBlend: { value: 1, type: 'f32' },
      uShowRaw: { value: 0, type: 'f32' },
      uArmyVisionSources: { value: new Float32Array(MAX_ARMY_VISION_SOURCES * 2), type: 'vec2<f32>' },
      uArmyVisionCount: { value: 0, type: 'f32' },
      uArmyVisionRadius: { value: 0, type: 'f32' },
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
   * §1c: uploads this frame's live army vision sources — world-space points,
   * already resolved by HexMapRenderer from its own army render-position
   * tracking (the same continuous, resync-eased position the army overlay
   * itself draws from) — plus the shared radius (world units) they reveal
   * within. Called every tick alongside `tick()`, never gated on a mask
   * fetch: this is the whole point of keeping §1c out of the cached texture
   * (see fogShader.ts's header). Silently truncates past
   * `MAX_ARMY_VISION_SOURCES` — see that constant's own comment.
   */
  setArmyVisionSources(points: readonly { x: number; y: number }[], radiusWorldUnits: number): void {
    const sources = this.uniforms.uniforms.uArmyVisionSources as Float32Array;
    const count = Math.min(points.length, MAX_ARMY_VISION_SOURCES);
    for (let i = 0; i < count; i++) {
      sources[i * 2] = points[i].x;
      sources[(i * 2) + 1] = points[i].y;
    }
    this.uniforms.uniforms.uArmyVisionCount = count;
    this.uniforms.uniforms.uArmyVisionRadius = radiusWorldUnits;
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
   * §2.8's real (functional, not cosmetic) debug toggles: `warp` zeroes both
   * edge-noise amplitudes, leaving the mask's raw `hexDistance` ramp to
   * shape the boundary on its own — the fog boundary snaps back to visible
   * concentric hexagons, which is the same diagnostic value v1's distJitter
   * toggle had and a direct read on how much work the noise is doing.
   * `showRawMask` bypasses the edge shaping and tier compositing entirely,
   * rendering the fetched mask texture unmodified.
   */
  setDebug(opts: { warpEnabled: boolean; showRawMask: boolean }): void {
    const edgeNoise = this.uniforms.uniforms.uEdgeNoise as Float32Array;
    edgeNoise[0] = opts.warpEnabled ? EDGE_NOISE[0] : 0;
    edgeNoise[1] = opts.warpEnabled ? EDGE_NOISE[1] : 0;
    const seedJitter = this.uniforms.uniforms.uSeedJitter as Float32Array;
    seedJitter[0] = opts.warpEnabled ? SEED_JITTER[0] : 0;
    seedJitter[1] = opts.warpEnabled ? SEED_JITTER[1] : 0;
    this.uniforms.uniforms.uShowRaw = opts.showRawMask ? 1 : 0;
  }

  /**
   * Advances uTime (the cloud field's animation clock, unless `driftEnabled`
   * is false — §2.8's drift toggle freezes the fog edge in place) and the
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

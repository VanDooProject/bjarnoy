// The water mesh — docs/design/water-shader.md §3.1. A Pixi v8 Mesh with
// world-space geometry, living *inside* the camera-transformed `world`
// container rather than on the stage the way fog's two quads do (waterShader.ts
// explains why at length).
import { BufferImageSource, GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import { FOAM_REACH_TILES, NEAR_SPAN_TILES, groundSquash, type WaterMask } from './waterMask';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import { WATER_FRAGMENT, WATER_VERTEX } from './waterShader';

/** Which view this layer is drawing for — decides whether the sea body term is available at all (§4.1). */
export type WaterMode = 'world' | 'settlement';

// The first two stops of WorldMapCanvas.vue's `.map-container` gradient
// (#2a92ae -> #14657f -> #0b3c50). Kept in sync with it deliberately: with
// `seaBody` off that gradient is what shows through, so the two want to be the
// same water.
//
// The third stop is deliberately *not* used. The CSS gradient is radial in
// **screen** space, so its darkest stop is a vignette at the viewport corners;
// this ramp is relative to the **coastline**, and saturates at FOAM_REACH_TILES
// — 1.5 tiles offshore. Ramping all the way to #0b3c50 over that distance
// paints essentially the whole ocean at the darkest stop, which is much darker
// than the sea in docs/design/img/worldmap.png, the art direction of record.
// Ending at the middle stop puts open water at the reference's own blue and
// keeps the lighter teal as what it reads as there: a shelf hugging the shore.
const SHALLOW_COLOR = 0x2a92ae;
const DEEP_COLOR = 0x14657f;

/**
 * Peak-to-peak brightness of the open-water mottle, and the reciprocal of its
 * feature size in world units. TILE_W is 168, so 1/1400 puts one blob at
 * roughly eight hexes across — large enough to read as the sea not being a
 * flat fill rather than as texture on it, which at this amplitude (±1.5% of
 * the colour) is all it is meant to do.
 */
const SEA_MOTTLE = 0.03;
const SEA_MOTTLE_SCALE = 1 / 1400;

/**
 * The wave crests' colour and peak alpha — HexMapRenderer's own WAVE_COLOR and
 * WAVE_ALPHA, so flipping `legacyWaveSquiggles` on next to the shader waves
 * compares two wave fields and not two palettes.
 */
const WAVE_COLOR = 0xffffff;
const WAVE_ALPHA = 0.42;

/**
 * Where the wave field fades in, measured in the mask's R channel (0 at the
 * coastline, 1 at 1.5 tiles). So crests start appearing a
 * third of a hex offshore and reach full strength just short of one — about
 * where today's per-hex `isNearLand` cull draws its hard line, but continuous,
 * which is what removes the hexagonal hole that cull leaves around every
 * island.
 *
 * Deliberately wide rather than tight. This is the one term that reads the
 * distance field out in the middle of its range, where the mask is coarsest;
 * the spike saw the field's texel stepping through a narrow fade here, and
 * spreading the fade over more distance is half the fix (raising
 * MASK_MAX_TEXELS is the other half).
 */
const WAVE_COAST_FADE: [number, number] = [0.22, 0.62];

/** The prototype's own hex width — every wave constant in the shader is in these units. See waterShader.ts. */
const WAVE_PROTOTYPE_HEX_W = 40;

/**
 * Foam colour — not pure white. The crests are white (WAVE_COLOR); giving the
 * foam the faintest blue cast keeps the two readable as different things where
 * they meet, and keeps a bright coastline from reading as a drawn outline.
 */
const FOAM_COLOR = 0xf2fbff;

/**
 * Fraction of the band's width, out from the coastline, over which the foam
 * stays at full strength before it starts falling off. The near-opaque inner
 * line lives on this plateau.
 */
const FOAM_INNER_FRACTION = 0.35;

/**
 * How far the band runs onto the land, as a fraction of its reach into the
 * water. Well under 1: foam belongs on the water licking the beach, not on the
 * beach. The first version had this effectively inverted — the land side ran
 * further than the water side and at full strength — which put the whole band
 * on the sand.
 */
const FOAM_LAND_REACH = 0.12;

/** Peak alpha of the two tiers: [inner line, outer lace]. */
const FOAM_ALPHA: [number, number] = [0.9, 0.6];

/**
 * The world map's foam, which is a different drawing rather than the same one
 * scaled down.
 *
 * Up close the band is soft: a bright inner line, a broken outer lace fading
 * out over it, and a short lick onto the sand. That is what water does at a
 * beach, and the settlement view is close enough to see it. From orbit the same
 * treatment has nothing to resolve into — a two-tier band a few pixels wide is
 * just a blurred white glow around every island, which reads as a drop shadow
 * on a sticker rather than as surf. So world mode drops the lace entirely,
 * holds the inner line at full strength across nearly the whole width, and
 * keeps essentially nothing on the land side: a crisp rim, drawn once.
 *
 * LAND_REACH is small rather than zero on purpose — the shader's land-side term
 * is a smoothstep over this, and GLSL leaves smoothstep undefined when its two
 * edges are equal.
 */
const FOAM_ALPHA_WORLD: [number, number] = [0.72, 0];
const FOAM_INNER_WORLD = 0.75;
const FOAM_LAND_REACH_WORLD = 0.02;

/**
 * What fraction of `foamWidthHexes` the world map's rim actually uses.
 *
 * The band is in world units, so the same 0.3 tiles that is a believable surf
 * line up close is a 10-15px pure-white outline from orbit — and measured
 * against docs/design/img/worldmap.png, the art direction of record has no white
 * outline around its islands at all, only a faint halo. A third of the width, at
 * FOAM_ALPHA_WORLD rather than full, keeps the coastline legible as a coastline
 * without drawing a cartoon stroke around it.
 */
const FOAM_WIDTH_WORLD_SCALE = 0.35;

/**
 * How far the band's **outer** edge is displaced by the drifting noise, in tile
 * widths, and the reciprocal of that noise's feature size in world units.
 *
 * A real distance, not a fraction of the band. It used to be multiplied by the
 * width as well, which with both constants below 1 made the actual displacement
 * about a fiftieth of a tile — one or two pixels, invisible — so the band had no
 * structure at any scale between "per hex" and "sub-pixel", which is why it read
 * as a drawn stroke. 0.09 tiles is around 15px in the settlement view, enough to
 * tear the boundary rather than merely wobble it. 1/260 puts one blob at about
 * one and a half hexes, so the coarse octave reads at the scale of a cove; the
 * shader adds a finer one at the band's own scale on top.
 */
const FOAM_NOISE = 0.09;
const FOAM_NOISE_SCALE = 1 / 260;

/**
 * Surge rate in radians/second, and the noise field's drift in noise-space
 * units/second. Slower than it was: with the surge de-synchronised along the
 * coast by a continuous field rather than a per-hex one, the same rate reads as
 * the whole band shimmering rather than as separate laps.
 */
const FOAM_SURGE_RATE = 0.8;
const FOAM_WIND: [number, number] = [0.03, -0.02];

/**
 * Caustic ribbons (§4.2b) — the close-up surface pattern, contour lines of a
 * churning noise field.
 *
 * `SCALE` is the reciprocal of the field's feature size in world units, so
 * 1/130 makes the field's own blobs roughly three quarters of a hex across; `BANDS` is how
 * many nested contours that field is sliced into, and `WIDTH` how thick each
 * one is as a fraction of the gap between them. Together those three are the
 * whole look, and they trade off against each other: few thick bands read as a
 * pale haze on the water rather than as ribbons at all, many thin ones as
 * fizz.
 */
const CAUSTIC_SCALE = 1 / 130;
const CAUSTIC_BANDS = 2.6;
const CAUSTIC_WIDTH = 0.115;
const CAUSTIC_ALPHA = 0.38;
/** Slightly cooler than the foam, so ribbons crossing a foam band still read as behind it. */
const CAUSTIC_COLOR = 0xdff4ff;

/**
 * Over how many tile widths the ribbons ramp from nothing to full strength,
 * starting at `causticFadeHexes` offshore. Only the start is on a slider: the
 * width is what makes the fade invisible as a fade, and there is one value that
 * does that. Narrower and the ribbons appear along a line parallel to the shore,
 * which reads as a second, softer coastline; wider and there is nowhere left
 * between the fade and the mask's 1.5-tile far range for them to actually be at
 * full strength.
 */
const CAUSTIC_CULL_SOFTEN_TILES = 0.03;

/**
 * How much further out than `causticCullHexes` a ribbon's own keep-off distance
 * may fall, in tile widths — each ribbon draws one value from this range and
 * holds it along its whole length (see `causticField`).
 *
 * Without a spread, every ribbon in the view stops at the same distance from
 * land and the boundary reads as drawn: a second, softer coastline, which is the
 * exact thing culling instead of fading was meant to avoid. Displacing one
 * shared cut line by position-noise fixes the straightness but not the fact that
 * it is one line; a per-ribbon distance means there is no line at all, and loops
 * that fall entirely inside their own keep-off are gone rather than clipped.
 *
 * 0.5 tiles is wide relative to the 0.35 default keep-off on purpose: the range
 * has to be several ribbon spacings across before neighbouring ribbons stop
 * ending at visibly similar distances. Not wider, though — the mask's far field
 * saturates at 1.5 tiles, and a keep-off anywhere near that means the ribbon is
 * missing from the whole of the water the eye takes in around an island.
 */
const CAUSTIC_CULL_SPREAD_TILES = 0.5;

/**
 * The second, finer caustic net (§4.2c) — same idiom as the one above, at a
 * smaller feature size and in a brighter colour.
 *
 * Scale is a multiple of the coarse net's rather than an absolute number, so the
 * two stay in the same relationship when the coarse one is retuned. 2.4x is
 * chosen to be an awkward ratio: at 2 or 3 the two nets' contours line up often
 * enough to read as one field drawn twice.
 *
 * Pure white against the coarse net's cooler `CAUSTIC_COLOR`, at a lower alpha.
 * That ordering is the point — a brighter colour carried thinly reads as a
 * highlight catching the surface, where the same white at the coarse net's alpha
 * just doubles the amount of white on the water and washes the sea out.
 */
const CAUSTIC_FINE_SCALE = CAUSTIC_SCALE * 2.4;
const CAUSTIC_FINE_BANDS = 2.2;
const CAUSTIC_FINE_WIDTH = 0.1;
const CAUSTIC_FINE_ALPHA = 0.26;
const CAUSTIC_FINE_COLOR = 0xffffff;

/**
 * The drifting shadow blobs (§4.2c) — the one caustic layer that darkens.
 *
 * `SCALE` is the reciprocal of the cell size, so 1/210 puts one blob every
 * ~1.25 hexes; `DENSITY` is the fraction of cells that carry one at all, which
 * with the in-cell jitter is what keeps them from reading as a grid. Radius is
 * a fraction of the cell (see `blobField`), so those two numbers set the whole
 * distribution.
 *
 * The colour is the settlement water's own hue at about half its brightness, not
 * a neutral grey: a desaturated shadow over a navy sea reads as haze rather than
 * as depth. It has to be chosen by *luminance* rather than by looking dark —
 * the first attempt here was 0x0a3b4d, which looks like deep water written down
 * but carries most of its weight in green and measured 49.9 against the painted
 * water's 51.1. It composited at full strength and changed nothing at all: the
 * 5th percentile of water luminance was identical with the layer on and off.
 */
const CAUSTIC_BLOB_SCALE = 1 / 210;
const CAUSTIC_BLOB_DENSITY = 0.9;
const CAUSTIC_BLOB_ALPHA = 0.42;
const CAUSTIC_BLOB_COLOR = 0x0d1728;

/**
 * What fraction of its width the foam keeps over a prop tile (§4.4b).
 *
 * Not zero. Taking the foam off the tile entirely was the first attempt and it
 * was worse than the artifact: foam is the coastline's outline as much as it is
 * water, so a bare stretch of shore is found by the eye immediately — much
 * faster than a ribbon crossing a rock. Half width still leaves the boat or rock
 * its own patch of still water while keeping the outline closed.
 *
 * A quarter, and the shader scales the band's ragged edge by the same factor
 * (see `shrink` in waterShader.ts). Half was tried in between and read as no
 * narrowing at all next to a rock: the edge noise is an absolute 0.09 tiles, so
 * left unscaled it swung a nominally 0.15-tile band out past 0.23 and back into
 * the stone. With the edge scaled too, a quarter is a quarter everywhere along
 * the band rather than only at its mean, which is what the earlier "too thin to
 * survive the art" reading was actually measuring.
 */
const PROP_FOAM_SCALE = 0.25;

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
  // The waves' own clock, advanced at `waveSpeed` times the rate of `clock`.
  private waveClock = 0;
  private suppressed = false;

  constructor(mode: WaterMode, tileWidth: number, tileHeight: number) {
    this.mode = mode;
    const world = mode === 'world';
    const [shallowR, shallowG, shallowB] = hexToRgb01(SHALLOW_COLOR);
    const [deepR, deepG, deepB] = hexToRgb01(DEEP_COLOR);
    const [waveR, waveG, waveB] = hexToRgb01(WAVE_COLOR);
    const [foamR, foamG, foamB] = hexToRgb01(FOAM_COLOR);
    const [causticR, causticG, causticB] = hexToRgb01(CAUSTIC_COLOR);
    const [fineR, fineG, fineB] = hexToRgb01(CAUSTIC_FINE_COLOR);
    const [blobR, blobG, blobB] = hexToRgb01(CAUSTIC_BLOB_COLOR);

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uWaveTime: { value: 0, type: 'f32' },
      uSeaBody: { value: 0, type: 'f32' },
      uMidWaterWaves: { value: 0, type: 'f32' },
      uShowMask: { value: 0, type: 'f32' },
      uShallowColor: { value: new Float32Array([shallowR, shallowG, shallowB]), type: 'vec3<f32>' },
      uDeepColor: { value: new Float32Array([deepR, deepG, deepB]), type: 'vec3<f32>' },
      uSeaMottle: { value: SEA_MOTTLE, type: 'f32' },
      uMottleScale: { value: SEA_MOTTLE_SCALE, type: 'f32' },
      uWaveColor: { value: new Float32Array([waveR, waveG, waveB]), type: 'vec3<f32>' },
      uWaveAlpha: { value: WAVE_ALPHA, type: 'f32' },
      uWaveCoastFade: { value: new Float32Array(WAVE_COAST_FADE), type: 'vec2<f32>' },
      uWaveScale: { value: tileWidth / WAVE_PROTOTYPE_HEX_W, type: 'f32' },
      uShorelineFoam: { value: 0, type: 'f32' },
      uFoamColor: { value: new Float32Array([foamR, foamG, foamB]), type: 'vec3<f32>' },
      uFoamWidth: { value: 0, type: 'f32' },
      uFoamInner: { value: world ? FOAM_INNER_WORLD : FOAM_INNER_FRACTION, type: 'f32' },
      uFoamLandReach: { value: world ? FOAM_LAND_REACH_WORLD : FOAM_LAND_REACH, type: 'f32' },
      uFoamAlpha: { value: new Float32Array(world ? FOAM_ALPHA_WORLD : FOAM_ALPHA), type: 'vec2<f32>' },
      uFoamNoise: { value: FOAM_NOISE, type: 'f32' },
      uFoamNoiseScale: { value: FOAM_NOISE_SCALE, type: 'f32' },
      uFoamSurge: { value: 0, type: 'f32' },
      uSurgeRate: { value: FOAM_SURGE_RATE, type: 'f32' },
      uFoamWind: { value: new Float32Array(FOAM_WIND), type: 'vec2<f32>' },
      uCaustics: { value: 0, type: 'f32' },
      uCausticScale: { value: CAUSTIC_SCALE, type: 'f32' },
      uCausticBands: { value: CAUSTIC_BANDS, type: 'f32' },
      // Band count, width and alpha are all set per frame from the panel's own
      // multipliers, so these are only the value before the first tick.
      uCausticWidth: { value: CAUSTIC_WIDTH, type: 'f32' },
      uCausticAlpha: { value: CAUSTIC_ALPHA, type: 'f32' },
      uCausticColor: { value: new Float32Array([causticR, causticG, causticB]), type: 'vec3<f32>' },
      uCausticCull: { value: 0, type: 'f32' },
      uCausticCullSoften: { value: CAUSTIC_CULL_SOFTEN_TILES, type: 'f32' },
      uCausticCullSpread: { value: CAUSTIC_CULL_SPREAD_TILES, type: 'f32' },
      uCausticFine: { value: 0, type: 'f32' },
      uCausticFineScale: { value: CAUSTIC_FINE_SCALE, type: 'f32' },
      uCausticFineBands: { value: CAUSTIC_FINE_BANDS, type: 'f32' },
      uCausticFineWidth: { value: CAUSTIC_FINE_WIDTH, type: 'f32' },
      uCausticFineAlpha: { value: CAUSTIC_FINE_ALPHA, type: 'f32' },
      uCausticFineColor: { value: new Float32Array([fineR, fineG, fineB]), type: 'vec3<f32>' },
      uCausticBlobs: { value: 0, type: 'f32' },
      uCausticBlobScale: { value: CAUSTIC_BLOB_SCALE, type: 'f32' },
      uCausticBlobDensity: { value: CAUSTIC_BLOB_DENSITY, type: 'f32' },
      uCausticBlobAlpha: { value: CAUSTIC_BLOB_ALPHA, type: 'f32' },
      uCausticBlobColor: { value: new Float32Array([blobR, blobG, blobB]), type: 'vec3<f32>' },
      uPropMute: { value: 0, type: 'f32' },
      uPropFoamScale: { value: PROP_FOAM_SCALE, type: 'f32' },
      // What the mask's far channel is normalised over, so the shader can decode
      // G back into tile widths the same way uNearSpan decodes R.
      uFarReach: { value: FOAM_REACH_TILES, type: 'f32' },
      uGroundSquash: { value: groundSquash(tileWidth, tileHeight), type: 'f32' },
      // Half-range of the mask's signed near field, so the shader can decode R
      // back into tile widths.
      uNearSpan: { value: NEAR_SPAN_TILES, type: 'f32' },
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
          // This is data, not an image. Without this Pixi premultiplies RGB by
          // A on upload — and A here is water coverage, so every land texel
          // would arrive with R = G = 0: "exactly on the coastline", which
          // paints full-strength foam across every land hex in the world. The
          // fog mask never hit this because it bakes A = 255 everywhere.
          alphaMode: 'no-premultiply-alpha',
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
    const elapsed = sinceLast / 1000;
    this.clock += elapsed;
    this.waveClock += elapsed * waterDebugTuning.waveSpeed;

    const u = this.uniforms.uniforms;
    u.uTime = this.clock;
    u.uWaveTime = this.waveClock;
    // Settlement mode never draws a sea body: the painted water tiles are it.
    u.uSeaBody = this.mode === 'world' && waterDebugFlags.seaBody ? 1 : 0;
    // World mode hands the surface pattern back to HexMapRenderer's Graphics
    // squiggles whenever those are on: they are crisp strokes on their own layer
    // *above* this mesh (worldLayerOrder puts `waves` after `water`), and two
    // wave fields drawn at once is neither look. Settlement mode is unaffected —
    // the squiggle layer is world-only.
    const squigglesOwnTheSurface = this.mode === 'world' && waterDebugFlags.legacyWaveSquiggles;
    u.uMidWaterWaves = waterDebugFlags.midWaterWaves && !squigglesOwnTheSurface ? 1 : 0;
    // Which surface pattern this view uses: caustic ribbons close up, the
    // prototype's scattered arcs from orbit. Two idioms rather than one tuned
    // two ways — see waterShader.ts's causticField.
    u.uCaustics = this.mode === 'settlement' || waterDebugFlags.causticsEverywhere ? 1 : 0;
    // The two extra caustic layers are sub-layers of that pattern, not effects
    // of their own: the shader only reaches them inside the caustic branch, so
    // these flags say "and this layer too" rather than turning anything on by
    // themselves.
    u.uCausticFine = waterDebugFlags.fineCaustics ? 1 : 0;
    u.uCausticBlobs = waterDebugFlags.causticShadows ? 1 : 0;
    u.uShorelineFoam = waterDebugFlags.shorelineFoam ? 1 : 0;
    // Settlement mode only. The mute protects the boat and rock painted on the
    // coastal water art, and world mode does not draw sea tiles at all
    // (HexMapRenderer's rebuildTerrainFlat skips them; the sea there is this
    // shader's own body). Honouring it there would thin the foam on a fifth of
    // every coastline to protect art that isn't on screen.
    u.uPropMute = this.mode === 'settlement' && waterDebugFlags.propTileMute ? 1 : 0;
    // Clamped to the far channel's own range: past it G is saturated, so a
    // larger value would silently mean "never fade in" rather than "start
    // further out".
    u.uCausticCull = Math.min(waterDebugTuning.causticCullHexes, FOAM_REACH_TILES);
    // Two knobs across both light nets rather than four across one each: the
    // coarse and fine nets are a *pair*, and the whole point of the fine one is
    // that it is thinner and brighter than the other. Multipliers keep that
    // relationship through any drag of either handle.
    u.uCausticWidth = CAUSTIC_WIDTH * waterDebugTuning.causticThickness;
    u.uCausticFineWidth = CAUSTIC_FINE_WIDTH * waterDebugTuning.causticThickness;
    u.uCausticAlpha = CAUSTIC_ALPHA * waterDebugTuning.causticBrightness;
    u.uCausticFineAlpha = CAUSTIC_FINE_ALPHA * waterDebugTuning.causticBrightness;
    u.uCausticBands = CAUSTIC_BANDS * waterDebugTuning.causticDensity;
    u.uCausticFineBands = CAUSTIC_FINE_BANDS * waterDebugTuning.causticDensity;
    // The panel's knob is in hexes; the shader's signed distance is in tile
    // widths, which for a flat-top hex is the same unit.
    u.uFoamWidth = waterDebugTuning.foamWidthHexes * (this.mode === 'world' ? FOAM_WIDTH_WORLD_SCALE : 1);
    u.uFoamSurge = waterDebugTuning.foamSurge;
    u.uShowMask = waterDebugFlags.showWaterMask ? 1 : 0;

    this.mesh.visible = waterDebugFlags.water && this.hasMask && !this.suppressed;
  }

  destroy(): void {
    this.retiredTexture?.destroy(true);
    this.texture?.destroy(true);
    this.mesh.destroy();
  }
}

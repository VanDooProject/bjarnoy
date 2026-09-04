// Debug-only switches for the water shader — docs/design/water-shader.md §5.
//
// Its own module rather than more of HexMapRenderer.ts (already ~2900 lines),
// but the same contract as `fogDebugFlags`: a plain, non-reactive object,
// mutated directly, read by the renderer once a frame. WaterDebugPanel.vue
// wraps it in `reactive()` so the renderer never imports Vue — see that
// panel's own comment on why that boundary is worth keeping.
//
// Debug panel only, deliberately. There is no player-facing graphics-settings
// UI in this app today and this feature is not the place to invent one.

export interface WaterDebugFlags {
  /** The whole water layer. Off hides the mesh entirely — the pre-shader look. */
  water: boolean;
  /**
   * The water's surface pattern: caustic ribbons in a settlement, the
   * prototype's scattered wave arcs on the world map (§4.2/§4.2b). One flag,
   * because a view only ever draws one of them — which one is decided by the
   * view, not here.
   */
  midWaterWaves: boolean;
  /**
   * Debug: draw the settlement's caustic ribbons on the world map too, so the
   * two idioms can be judged at the same scale instead of one per view.
   */
  causticsEverywhere: boolean;
  /**
   * The coarse caustic net — the base surface pattern of §4.2b. A sub-layer of
   * `midWaterWaves` like the two below, so that the finer net and the pools can
   * be judged without it rather than only on top of it.
   */
  coarseCaustics: boolean;
  /**
   * The second, finer caustic net drawn over the first (§4.2c) — smaller cells,
   * brighter. A sub-layer of the surface pattern: it only draws where the
   * caustics themselves do, so this does nothing on the world map unless
   * `causticsEverywhere` is on too.
   */
  fineCaustics: boolean;
  /**
   * The drifting dark blobs under the caustics (§4.2c) — the one water layer
   * that darkens rather than lightens. Same sub-layer relationship as
   * `fineCaustics`: off leaves the two light nets over flat water.
   */
  causticShadows: boolean;
  /** Shader shoreline foam (§4.3). */
  shorelineFoam: boolean;
  /**
   * Quieten the shader over the coastal water tiles whose art carries a prop — a
   * beached boat or a rock (§4.4b): the surface pattern goes, and the foam
   * narrows to a quarter of its width rather than disappearing. Off draws both
   * straight across the prop, which is the artifact this exists to fix.
   */
  propTileMute: boolean;
  /** Shader sea body under the world map (§4.1); off lets WorldMapCanvas's CSS gradient show through. Never drawn in settlement mode — the painted water tiles are the sea body there. */
  seaBody: boolean;
  /**
   * The Graphics wave squiggles (HexMapRenderer's waveLayer) — world map only,
   * and **on**: they are the world map's surface pattern of record. They live on
   * their own layer above the water mesh, so they draw over the shader's sea
   * body and foam rather than under them.
   *
   * The two wave systems never double-draw: with this on, the shader stops
   * drawing its own arcs in world mode (see WaterLayer.tick). Off is how the
   * shader's arcs get looked at next to docs/design/img/worldmap.png.
   */
  legacyWaveSquiggles: boolean;
  /**
   * Render the mask's channels raw instead of water. This is what the
   * throwaway spike existed to show — the mask's own idea of where the
   * coastline is, laid over the art, so §3.4's alignment claim stays
   * checkable on screen rather than only in waterMask.test.ts.
   */
  showWaterMask: boolean;
  /**
   * Cut the unsplit tall art families into base/top halves in code
   * (legacyTileSplit.ts) so their overhang sits above the water mesh. Off
   * reproduces the artifact that exists to fix, which is the only way to see
   * it. Goes away with the split itself once the art pack ships split.
   */
  legacyTileSplit: boolean;
}

export const waterDebugFlags: WaterDebugFlags = {
  water: true,
  midWaterWaves: true,
  causticsEverywhere: false,
  coarseCaustics: true,
  fineCaustics: true,
  causticShadows: true,
  shorelineFoam: true,
  propTileMute: true,
  seaBody: true,
  legacyWaveSquiggles: true,
  showWaterMask: false,
  legacyTileSplit: true,
};

/**
 * Water knobs that are a *value* rather than an on/off — same debug-only
 * status, kept separate for the same reason `fogDebugTuning` is: WaterDebugPanel
 * renders one checkbox per key of WaterDebugFlags and types its label map off
 * it, so that interface has to stay all-boolean.
 */
export interface WaterDebugTuning {
  /**
   * Foam band width, in hexes. Scales both tiers (§4.3's inner line and outer
   * lace) together.
   *
   * The band is in *world* units, so it is the same water at every zoom — which
   * is exactly why this has to be sized against the close-up view rather than
   * the world map. The plan's 0.5 reads as a modest rim from orbit and washes
   * whole coastal hexes white in a settlement.
   */
  foamWidthHexes: number;
  /**
   * How much the band's width breathes, as a fraction of itself. 0 freezes the
   * surge. Well under half: the surge is meant to be felt rather than seen, and
   * a band whose width swings by a third reads as an animation error.
   */
  foamSurge: number;
  /** Multiplier on the wave swell rate. 1 is the shipped rate, matching the Graphics squiggles' own periods. */
  waveSpeed: number;
  /**
   * How close to the shore the caustic ribbons are allowed to come, in hexes.
   * Inside it they are simply absent — cut, not faded, since a half-strength
   * ribbon reads as a smudge and a belt of them reads as a second coastline. The
   * cut line wanders by CAUSTIC_CULL_JITTER_TILES either side of this so it
   * isn't a clean offset curve of the coast.
   *
   * Capped by the mask's own far range (FOAM_REACH_TILES, 1.5 hexes): past that
   * the distance channel is saturated and moving this further has no effect.
   */
  causticCullHexes: number;
  /**
   * Multipliers on the **coarse** caustic net's ribbon thickness, alpha and band
   * count (§4.2b), and the same three for the **fine** net over it (§4.2c).
   *
   * Multipliers and not absolute values, because the two nets are banded at
   * different scales: the shipped widths are fractions of each net's *own* band
   * spacing, so one absolute number would mean two different-looking ribbons.
   * 1.00x is what ships, which makes either direction a comparison against it.
   *
   * Per net rather than shared. They started shared, on the reasoning that the
   * fine net is *defined* by being thinner and brighter than the coarse one and
   * that one multiplier keeps that relationship through any drag. True, but it
   * also makes the relationship unadjustable, and the relationship is most of
   * what there is to tune once both nets exist.
   *
   * Density is orthogonal to thickness by construction: the band count sets the
   * spacing between contours, and the shader measures ribbon width as a plain
   * distance in field space rather than as a fraction of that spacing. So it
   * moves the ribbons closer together without fattening them, and past about 2x
   * they start to touch — the useful end of the range, not a bug.
   *
   * None of the six touches the shadow pools. Brightness would darken the water
   * if it did, and the pools' density is a level in a field rather than a count.
   */
  causticThickness: number;
  causticBrightness: number;
  causticDensity: number;
  causticFineThickness: number;
  causticFineBrightness: number;
  causticFineDensity: number;
  /**
   * How far the fine net is slid along its own clock, in seconds, relative to
   * the coarse one.
   *
   * The two nets are independent fields, but independent is not the same as out
   * of step: each breathes as its level set walks, and with the clocks aligned
   * the busy and empty moments coincide — the water goes bare and then crowded
   * with both nets doing it at once, which is what this exists to break. No
   * amount of making the fields more different from each other fixes that; only
   * offsetting one in time does.
   */
  causticFinePhase: number;
}

export const waterDebugTuning: WaterDebugTuning = {
  foamWidthHexes: 0.3,
  foamSurge: 0.18,
  waveSpeed: 1,
  causticCullHexes: 0.35,
  causticThickness: 1,
  causticBrightness: 1,
  causticDensity: 1,
  causticFineThickness: 1,
  causticFineBrightness: 1,
  causticFineDensity: 1,
  // A little over half the coarse net's ~30s breathing period, so the two are
  // close to opposed rather than merely unequal.
  causticFinePhase: 17,
};

/**
 * What the water layer cost on its last bake and its last frame, for
 * WaterPerfPanel — the `fogPerfStats` idea applied to this feature.
 *
 * A plain object mutated directly by the writers and polled by the panel, for
 * the same reason `fogPerfStats` is: HexMapRenderer and WaterLayer stay free of
 * Vue reactivity, and a raw write would never trip a proxy trap anyway.
 *
 * Only things that are actually measured. The bake is CPU work this code owns,
 * so it is timed directly; the frame interval is what the browser reports. What
 * is deliberately *not* here is the shader's own GPU cost — measuring that needs
 * a timer query this codebase has no plumbing for, and §4.2d's numbers came from
 * toggling the layer and watching the frame interval rather than from anything
 * the running app can report. FogPerfPanel leaves `shaderPassMs` off for exactly
 * that reason and this follows it: an honest gap beats a fabricated row.
 */
export interface WaterPerfStats {
  /** Wall-clock of the last `bakeWaterMask`, in ms. */
  bakeMs: number;
  /** Texel dimensions of that bake, and their product. */
  maskWidth: number;
  maskHeight: number;
  /** How many bakes have happened this session — a re-bake is a camera leaving its region, so this rising while the camera sits still is a bug. */
  bakes: number;
  /** Median frame interval over the last second, in ms, sampled by the panel itself. */
  frameMs: number;
}

export const waterPerfStats: WaterPerfStats = {
  bakeMs: 0,
  maskWidth: 0,
  maskHeight: 0,
  bakes: 0,
  frameMs: 0,
};

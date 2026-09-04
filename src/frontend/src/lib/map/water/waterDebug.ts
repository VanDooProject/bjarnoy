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
  /** Shader shoreline foam (§4.3). */
  shorelineFoam: boolean;
  /**
   * Fade the whole shader out over the coastal water tiles whose art carries a
   * prop — a beached boat or a rock (§4.4). Off draws foam and caustics straight
   * across them, which is the artifact this exists to fix.
   */
  propTileMute: boolean;
  /** Shader sea body under the world map (§4.1); off lets WorldMapCanvas's CSS gradient show through. Never drawn in settlement mode — the painted water tiles are the sea body there. */
  seaBody: boolean;
  /**
   * The pre-shader Graphics wave squiggles (HexMapRenderer's waveLayer).
   * Defaults **off** so the two wave systems don't double-draw; the point of
   * keeping it at all is that flipping it on next to
   * docs/design/img/worldmap.png is how the shader's waves get signed off. If
   * they can't be made to match, this flag is the decision point rather than
   * a silent regression.
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
  shorelineFoam: true,
  propTileMute: true,
  seaBody: true,
  legacyWaveSquiggles: false,
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
  /** How much the band's width breathes, as a fraction of itself. 0 freezes the surge. */
  foamSurge: number;
  /** Multiplier on the wave swell rate. 1 is the shipped rate, matching the Graphics squiggles' own periods. */
  waveSpeed: number;
  /**
   * How far offshore the caustic ribbons start fading in, in hexes; they reach
   * full strength a fixed CAUSTIC_FADE_WIDTH_TILES further out. 0 puts them
   * right up against the coastline, which is where they compete with the foam.
   *
   * Capped by the mask's own far range (FOAM_REACH_TILES, 1.5 hexes): past that
   * the distance channel is saturated and moving this further has no effect.
   */
  causticFadeHexes: number;
}

export const waterDebugTuning: WaterDebugTuning = {
  foamWidthHexes: 0.3,
  foamSurge: 0.35,
  waveSpeed: 1,
  causticFadeHexes: 0.4,
};

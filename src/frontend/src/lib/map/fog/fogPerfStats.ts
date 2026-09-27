// Kept in its own module, not in HexMapRenderer.ts, so the few non-renderer
// readers/writers (stores/world.ts's fog-mask fetch, FogPerfPanel) can reach
// this plain object without importing the whole Pixi renderer — and with it
// textures.ts/atlas.ts and every eagerly imported atlas manifest — just for a
// stats record. HexMapRenderer.ts re-exports it for existing importers.
//
// Per-rebuild/per-frame stats, read by FogPerfPanel — §2.8's "what's
// actually happening now" list, scoped to what this slice can honestly
// measure. `shaderPassMs` (the actual GPU cost of the fog draw) and
// `cacheHitRate` (server-side compute-cache hits, surfaced via a response
// header) are real §2.8 stats this doesn't populate yet — a GPU timer query
// extension and a header-reading fetch wrapper are both real follow-up work,
// not faked here (per §2.8's own "shouldn't be faked; absence is itself
// informative").
export interface FogPerfStats {
  /** rebuildTerrain/rebuildTerrainFlat: placing (or culling) terrain sprites/fills. Affected by terrainCull. */
  terrainMs: number;
  /** Hexes that got a terrain sprite/fill this rebuild. */
  terrainDrawnCount: number;
  /** Hexes skipped by isPastTerrainCull (terrainCull). */
  terrainCulledCount: number;
  /** rebuildBorders' per-hex loop. Affected by realmBorders. */
  bordersMs: number;
  /** True when this rebuild took the deepFogOnly shortcut — the whole viewport is certainly unexplored, so terrain/borders/waves were skipped entirely. */
  deepFogOnly: boolean;
  /** Owned hexes that drew a realm-border wash/stroke — gated by realmBorders. */
  borderedHexCount: number;
  /** rebuildMarkers: settlement/island/fleet icon placement. */
  markersMs: number;
  /** rebuildWaves: world-mode open-water squiggle placement (world mode only; 0 in settlement mode). */
  wavesMs: number;
  /** Wave squiggles kept by rebuildWaves — the ones drawWaves re-strokes every frame. */
  waveDrawnCount: number;
  /**
   * `drawWaves` itself — the per-*frame* cost of re-stroking those squiggles,
   * as a mean over the last second.
   *
   * Separate from `wavesMs`, which times only their *placement* and so runs
   * once per rebuild. This is the one that runs every tick: the layer is
   * cleared and every surviving point re-recorded as two quadratic curves,
   * which PixiJS then re-flattens and re-tessellates on the CPU. It is also
   * the one number here that is not part of `totalMs` — it is not part of a
   * rebuild at all.
   */
  waveDrawMs: number;
  /** Wave squiggles rebuildWaves dropped because opaque mist covers them (0 when waveCull is off). */
  waveCulledCount: number;
  /**
   * The water mask bake, when this rebuild ran one *on this thread* — 0 when
   * it reused the mask it already had, deferred the bake past a gesture, or
   * handed it to the worker (which is now the normal case; see
   * `waterPerfStats.bakedOnWorker` for where the last one ran and what it
   * took).
   *
   * Broken out because for a long time it was the largest thing in `totalMs`
   * by an order of magnitude and the breakdown said nothing about it: a
   * zoomed-out world map read `terrain 20.6 / borders 4.3 / waves 9.5` under a
   * total of 498, and the 460ms it did not mention was this.
   */
  waterMaskMs: number;
  /** Sum of the above plus the small remainder not broken out on its own. */
  totalMs: number;
  /**
   * Hexes the rebuild actually walked — the number the above times scale with,
   * and the denominator the drawn/culled counts are shares of. Not itself a
   * count of anything drawn: some of these are the open sea that is the
   * background rather than a hex.
   */
  hexCount: number;
  /**
   * Hexes the viewport rect covers, before the scan is clipped to where
   * terrain can draw (`scanClipSources`).
   *
   * The gap between this and `hexCount` is the cull that now happens by
   * construction rather than per hex — at full zoom-out it is the difference
   * between walking 58,000 hexes and walking 1,000 — and without it reported
   * the panel would show that cull as a `terrainCulledCount` of zero, which
   * reads exactly like a cull that has stopped working.
   */
  viewportHexCount: number;
  /** The fog mask fetch's own wall-clock time (stores/world.ts's fetchFogMask), independent of any renderer rebuild. */
  maskFetchMs: number;
  /** Whether a fog-mask fetch is currently in flight. */
  maskFetchInFlight: boolean;
  /** The current mask's ETag, or null before the first successful fetch — lets a debug session confirm a settlement change actually bumped the version. */
  maskVersion: string | null;
}
export const fogPerfStats: FogPerfStats = {
  terrainMs: 0,
  terrainDrawnCount: 0,
  terrainCulledCount: 0,
  bordersMs: 0,
  deepFogOnly: false,
  borderedHexCount: 0,
  markersMs: 0,
  wavesMs: 0,
  waveDrawnCount: 0,
  waveCulledCount: 0,
  waveDrawMs: 0,
  waterMaskMs: 0,
  totalMs: 0,
  hexCount: 0,
  viewportHexCount: 0,
  maskFetchMs: 0,
  maskFetchInFlight: false,
  maskVersion: null,
};

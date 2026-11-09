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
import { GUST_LAKE_PHASE_OFFSET } from './bogLakeGust';
import { GUST_BAND_HALF_WIDTH } from './bogLakeShader';
/** The bog lake foam line styles, by `uFoamStyle` index (bogLakeShader.ts foamLook). */
export const BOG_LAKE_FOAM_STYLES = ['strands', 'tapered strands', 'crest + shadow', 'micro curls', 'ring arcs', 'glint squiggles'];
export const waterDebugFlags = {
    water: true,
    midWaterWaves: true,
    causticsEverywhere: false,
    coarseCaustics: true,
    fineCaustics: true,
    causticShadows: true,
    shorelineFoam: true,
    seaBody: true,
    legacyWaveSquiggles: true,
    showWaterMask: false,
    riverFlow: true,
    showRiverFlow: false,
    riverStyle: 4,
    legacyTileSplit: true,
    bogLakeFoam: false,
    bogLakeSheen: false,
    bogLakeCatsPaws: false,
    bogLakeBlops: true,
};
export const waterDebugTuning = {
    foamWidthHexes: 0.3,
    foamSurge: 0.18,
    waveSpeed: 1,
    causticCullHexes: 0.1,
    causticThickness: 1,
    causticBrightness: 1,
    causticDensity: 1,
    causticFineThickness: 1,
    causticFineBrightness: 1,
    causticFineDensity: 1,
    // A little over half the coarse net's ~30s breathing period, so the two are
    // close to opposed rather than merely unequal.
    causticFinePhase: 17,
    riverBrightness: 1,
    riverSpeed: 1,
    riverArc: 1,
    riverStreakMix: 0.25,
    bogLakeFoamStrength: 1,
    bogLakeSheenStrength: 1,
    bogLakeCatsPawsStrength: 1,
    bogLakeBlopsStrength: 1,
    bogLakeBlopDensity: 0.5,
    bogLakeBlopSize: 1,
    bogLakeFoamWidth: 0.04,
    bogLakeFoamSpacing: 15,
    bogLakeBandHalf: GUST_BAND_HALF_WIDTH,
    mapAnimationSpeed: 1,
    bogLakeFoamStyle: BOG_LAKE_FOAM_STYLES.indexOf('micro curls'),
    bogLakeGustPhaseOffset: GUST_LAKE_PHASE_OFFSET,
};
export const waterPerfStats = {
    bakeMs: 0,
    maskWidth: 0,
    maskHeight: 0,
    bakes: 0,
    frameMs: 0,
    bakedOnWorker: false,
};

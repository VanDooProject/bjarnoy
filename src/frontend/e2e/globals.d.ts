/**
 * The app's console/test-only `window` hooks, declared once.
 *
 * `fog-drift.spec.ts` and `water-shader.spec.ts` each carried their own
 * `declare global { interface Window { __fogDebug: ... } }`, and the two
 * disagreed about `__fogDebug`'s shape — which TypeScript reports as
 * "Subsequent property declarations must have the same type" the moment
 * anything typechecks the suite as one project. One declaration here, no
 * copies in specs.
 *
 * The flags are typed as boolean maps rather than re-spelling the real
 * shapes: `FogDebugFlags` (src/lib/map/HexMapRenderer.ts) and
 * `WaterDebugFlags` (src/lib/map/water/waterDebug.ts) are the authority, and
 * the e2e project deliberately doesn't pull the app's Pixi-typed modules in
 * just to name them.
 *
 * The renderer's surface (`__settlementRenderer`, `SettlementRendererHook`
 * below) is declared here because the slice e2e uses is small and stable; it
 * is written structurally for the same reason as the flags. `__demoWorld` is
 * declared as the untyped Pinia world store: call sites that need type safety
 * narrow it with a local slice type of their own (as SettlementPage does),
 * so each states exactly the part of `WorldModel` it reads.
 */
declare global {
  type AxialCoord = { q: number; r: number };

  /** Structural copy of `ArmyOverlayFrame` (src/lib/map/HexMapRenderer.ts). */
  interface ArmyOverlayFrameSnapshot {
    armies: { id: string; x: number; y: number; interpolated: boolean }[];
    waypoints: { index: number; x: number; y: number }[];
    targets: { kind: 'attack' | 'support'; x: number; y: number }[];
    /** Whether the SVG marker icon set finished loading — false means the fallback shapes are being drawn. */
    iconsReady: boolean;
  }

  /**
   * The slice of `HexMapRenderer` (src/lib/map/HexMapRenderer.ts) that e2e uses,
   * as returned by `window.__settlementRenderer()`.
   */
  interface SettlementRendererHook {
    hexCenterScreen(coord: AxialCoord): { x: number; y: number };
    dialScreenPoint(coord: AxialCoord): { x: number; y: number };
    whenFrameRendered(): Promise<void>;
    forceRebuild(opts?: { transition?: { durationMs: number; delayMs?: (coord: AxialCoord) => number } }): void;
    markerVisibility(): { badges: Record<string, number> };
    lastArmyOverlayFrame(): ArmyOverlayFrameSnapshot;
    readonly renderedFrames: number;
    readonly cameraZoom: number;
    readonly cameraView: { coord: AxialCoord; zoom: number };
    readonly cameraAnimating: boolean;
    readonly previewCenter: AxialCoord | undefined;
    /** `private` in HexMapRenderer; read at runtime only, as a test probe (zoom-transition.spec.ts). */
    readonly options: { mode: string };
  }

  /**
   * The Pinia world store, untyped on purpose: call sites narrow the slice they
   * read locally, e.g. `window.__demoWorld() as { model: any; selectedSettlementId: string }`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type DemoWorldHook = any;

  interface Window {
    /** The settlement/world map renderer's test surface — see `SettlementRendererHook`. */
    __settlementRenderer: () => SettlementRendererHook;
    /** The Pinia world store — see `DemoWorldHook`. */
    __demoWorld: () => DemoWorldHook;
    /** Debug-only fog switches — see main.ts and HexMapRenderer's `fogDebugFlags`. */
    __fogDebug: Record<string, boolean>;
    /** Debug-only water-shader switches — see main.ts and `waterDebugFlags`. */
    __waterDebug: Record<string, boolean>;
    /** Debug-only water counters — see main.ts and `waterPerfStats`. */
    __waterPerf: { bakes: number };
  }
}

export {};

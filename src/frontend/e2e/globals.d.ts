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
 * `__demoWorld` and `__settlementRenderer` are NOT declared here on purpose:
 * they are reached through local `window as unknown as {...}` casts inside
 * the page objects, so each call site states exactly the slice of
 * `WorldModel` it uses instead of a single global any-typed hook growing
 * without review. See SettlementPage.ts.
 */
declare global {
  interface Window {
    /** Debug-only fog switches — see main.ts and HexMapRenderer's `fogDebugFlags`. */
    __fogDebug: Record<string, boolean>;
    /** Debug-only water-shader switches — see main.ts and `waterDebugFlags`. */
    __waterDebug: Record<string, boolean>;
  }
}

export {};

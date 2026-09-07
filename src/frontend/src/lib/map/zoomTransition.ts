// Zoom-driven world<->settlement transition — docs/design/zoom-transition.md.
//
// Its own module rather than more of HexMapRenderer.ts (already ~3000+
// lines), same contract as `fogDebugTuning`/`waterDebugTuning`: a plain,
// non-reactive object, mutated directly, read by the renderer on every wheel/
// pinch event. The debug panel wraps it in `reactive()` so this module never
// imports Vue, and owns sessionStorage persistence itself (kept out of here
// so this stays a pure module, importable and testable under Vitest's Node
// environment with no DOM).
//
// `transitionForZoom` is edge-triggered (fires on a zoom step *crossing* a
// threshold), not level-triggered (fires whenever zoom is above/below one) —
// deliberately. World mode's resting zoom (WORLD_DEFAULT_ZOOM = 0.22) and
// settlement mode's minimum resting zoom (FOG_MARGIN_MIN_ZOOM = 0.22) are the
// same number, so a level check would immediately re-trigger an exit the
// instant a large settlement opens via the nav button or a fresh mount. An
// edge check only fires on an actual wheel/pinch gesture crossing the line,
// so an externally-placed camera (nav button, `settlementCameraOrigin`,
// browser back/forward) never spuriously re-triggers a gesture-driven switch
// — see zoom-transition.md §3.

export type ZoomTransitionMode = 'world' | 'settlement';
export type ZoomTransitionResult = 'enter' | 'exit' | null;

export interface ZoomTransitionTuning {
  /** Master switch — false makes transitionForZoom always return null. */
  enabled: boolean;
  /** Zoom-in threshold (world -> settlement). Must stay above exitToWorldZoom (see clampTuning). */
  enterSettlementZoom: number;
  /** Zoom-out threshold (settlement -> world). Must stay below enterSettlementZoom. */
  exitToWorldZoom: number;
  /**
   * How long (ms) the mode swap's crossfade takes — see HexMapRenderer's
   * `zoomBy`/`onTick`: the `world` container (terrain/water/buildings, not
   * fog or markers — those are stage siblings, see mount()'s own comment)
   * drops to alpha 0 the instant a threshold is crossed, then eases back to
   * 1 over this many milliseconds, masking the terrain/building swap
   * instead of popping straight to the new mode's geometry. 0 disables the
   * fade (an instant swap).
   */
  fadeMs: number;
}

// Shipped defaults, kept as separate named constants (rather than only
// living inside the tuning object) so the debug panel can label its
// "reset to default" action and so a test can assert the shipped values
// against the renderer's own framing constants — see zoom-transition.md §3.
// The two thresholds sit close together (a narrow hysteresis band) so the
// transition fires after a natural, short zoom gesture in either direction
// rather than requiring a zoom sweep across most of the settlement zoom
// range (SETTLEMENT_DEFAULT_ZOOM = 0.85 in HexMapRenderer.ts) before it
// takes effect.
export const DEFAULT_ENTER_SETTLEMENT_ZOOM = 0.5;
export const DEFAULT_EXIT_TO_WORLD_ZOOM = 0.4;
export const DEFAULT_FADE_MS = 260;

export const zoomTransitionTuning: ZoomTransitionTuning = {
  enabled: true,
  enterSettlementZoom: DEFAULT_ENTER_SETTLEMENT_ZOOM,
  exitToWorldZoom: DEFAULT_EXIT_TO_WORLD_ZOOM,
  fadeMs: DEFAULT_FADE_MS,
};

/**
 * Keeps the two thresholds from crossing each other — an inverted or equal
 * pair would make every zoom step "cross" both on the way past, firing
 * enter and exit in the same gesture. Called by the debug panel after each
 * slider drag; not enforced by the interface type since a slider mid-drag
 * legitimately passes through invalid intermediate states. Also clamps
 * fadeMs to a sane range for the same reason.
 */
export function clampTuning(tuning: ZoomTransitionTuning): ZoomTransitionTuning {
  const minGap = 0.01;
  const enter = Math.max(tuning.enterSettlementZoom, tuning.exitToWorldZoom + minGap);
  const fadeMs = Math.min(800, Math.max(0, tuning.fadeMs));
  return { ...tuning, enterSettlementZoom: enter, fadeMs };
}

/**
 * Whether a zoom step from `prevZoom` to `nextZoom` crosses this mode's
 * threshold, and in which direction. A pure function of the two zoom values
 * and the tuning — no camera/mode-switch side effects, so the caller decides
 * what "enter"/"exit" actually does (HexMapRenderer.setMode + a guarded
 * router.push).
 */
export function transitionForZoom(
  mode: ZoomTransitionMode,
  prevZoom: number,
  nextZoom: number,
  tuning: ZoomTransitionTuning,
): ZoomTransitionResult {
  if (!tuning.enabled) return null;
  if (mode === 'world') {
    // Zooming in: crossed upward through the enter threshold.
    if (prevZoom < tuning.enterSettlementZoom && nextZoom >= tuning.enterSettlementZoom) return 'enter';
    return null;
  }
  // mode === 'settlement': zooming out, crossed downward through the exit threshold.
  if (prevZoom > tuning.exitToWorldZoom && nextZoom <= tuning.exitToWorldZoom) return 'exit';
  return null;
}

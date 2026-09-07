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
}

// Shipped defaults, kept as separate named constants (rather than only
// living inside the tuning object) so the debug panel can label its
// "reset to default" action and so a test can assert the shipped values
// against the renderer's own framing constants — see zoom-transition.md §3:
// the enter threshold sits near the top of the settlement zoom range
// (SETTLEMENT_DEFAULT_ZOOM = 0.85 in HexMapRenderer.ts), not the bottom,
// since settlement-mode rendering costs more per visible hex.
export const DEFAULT_ENTER_SETTLEMENT_ZOOM = 0.8;
export const DEFAULT_EXIT_TO_WORLD_ZOOM = 0.3;

export const zoomTransitionTuning: ZoomTransitionTuning = {
  enabled: true,
  enterSettlementZoom: DEFAULT_ENTER_SETTLEMENT_ZOOM,
  exitToWorldZoom: DEFAULT_EXIT_TO_WORLD_ZOOM,
};

/**
 * Keeps the two thresholds from crossing each other — an inverted or equal
 * pair would make every zoom step "cross" both on the way past, firing
 * enter and exit in the same gesture. Called by the debug panel after each
 * slider drag; not enforced by the interface type since a slider mid-drag
 * legitimately passes through invalid intermediate states.
 */
export function clampTuning(tuning: ZoomTransitionTuning): ZoomTransitionTuning {
  const minGap = 0.01;
  const enter = Math.max(tuning.enterSettlementZoom, tuning.exitToWorldZoom + minGap);
  return { ...tuning, enterSettlementZoom: enter };
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

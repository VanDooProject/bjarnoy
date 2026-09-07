import { describe, expect, it } from 'vitest';
import {
  clampTuning,
  DEFAULT_ENTER_SETTLEMENT_ZOOM,
  DEFAULT_EXIT_TO_WORLD_ZOOM,
  DEFAULT_FADE_MS,
  transitionForZoom,
  type ZoomTransitionTuning,
} from './zoomTransition';

const tuning: ZoomTransitionTuning = {
  enabled: true,
  enterSettlementZoom: 0.8,
  exitToWorldZoom: 0.3,
  fadeMs: DEFAULT_FADE_MS,
};

describe('transitionForZoom', () => {
  it('fires "enter" when zooming in crosses the enter threshold from below', () => {
    expect(transitionForZoom('world', 0.7, 0.85, tuning)).toBe('enter');
  });

  it('does not fire "enter" when already above the threshold (no crossing)', () => {
    expect(transitionForZoom('world', 0.85, 0.9, tuning)).toBeNull();
  });

  it('does not fire "enter" when staying below the threshold', () => {
    expect(transitionForZoom('world', 0.5, 0.7, tuning)).toBeNull();
  });

  it('fires "exit" when zooming out crosses the exit threshold from above', () => {
    expect(transitionForZoom('settlement', 0.4, 0.2, tuning)).toBe('exit');
  });

  it('does not fire "exit" when already below the threshold (no crossing)', () => {
    expect(transitionForZoom('settlement', 0.2, 0.1, tuning)).toBeNull();
  });

  it('does not fire "exit" when staying above the threshold', () => {
    expect(transitionForZoom('settlement', 0.9, 0.6, tuning)).toBeNull();
  });

  it('never fires in the dead band between the two thresholds, in either mode', () => {
    expect(transitionForZoom('world', 0.5, 0.6, tuning)).toBeNull();
    expect(transitionForZoom('settlement', 0.6, 0.5, tuning)).toBeNull();
  });

  it('returns null in every case when disabled', () => {
    const disabled = { ...tuning, enabled: false };
    expect(transitionForZoom('world', 0.7, 0.85, disabled)).toBeNull();
    expect(transitionForZoom('settlement', 0.4, 0.2, disabled)).toBeNull();
  });

  it('is edge-triggered, not level-triggered: a settlement resting at the world default zoom does not immediately exit', () => {
    // WORLD_DEFAULT_ZOOM and FOG_MARGIN_MIN_ZOOM (HexMapRenderer.ts) are both
    // 0.22 — a settlement opened via the nav button can rest exactly there,
    // below the default exit threshold, without ever having "crossed" it.
    expect(transitionForZoom('settlement', 0.22, 0.22, tuning)).toBeNull();
  });

  it('the shipped defaults leave a settlement mid-resting-range and the world default zoom on the non-transitioning side', () => {
    const shipped: ZoomTransitionTuning = {
      enabled: true,
      enterSettlementZoom: DEFAULT_ENTER_SETTLEMENT_ZOOM,
      exitToWorldZoom: DEFAULT_EXIT_TO_WORLD_ZOOM,
      fadeMs: DEFAULT_FADE_MS,
    };
    const WORLD_DEFAULT_ZOOM = 0.22;
    const FOG_MARGIN_MIN_ZOOM = 0.22;
    const SETTLEMENT_DEFAULT_ZOOM = 0.85;
    expect(WORLD_DEFAULT_ZOOM).toBeLessThan(shipped.enterSettlementZoom);
    expect(FOG_MARGIN_MIN_ZOOM).toBeLessThan(shipped.enterSettlementZoom);
    expect(SETTLEMENT_DEFAULT_ZOOM).toBeGreaterThan(shipped.exitToWorldZoom);
  });
});

describe('clampTuning', () => {
  it('leaves a well-ordered pair untouched', () => {
    expect(clampTuning(tuning)).toEqual(tuning);
  });

  it('pushes enterSettlementZoom above exitToWorldZoom when a slider drag inverts them', () => {
    const inverted: ZoomTransitionTuning = {
      enabled: true,
      enterSettlementZoom: 0.2,
      exitToWorldZoom: 0.5,
      fadeMs: DEFAULT_FADE_MS,
    };
    const fixed = clampTuning(inverted);
    expect(fixed.enterSettlementZoom).toBeGreaterThan(fixed.exitToWorldZoom);
    expect(fixed.exitToWorldZoom).toBe(0.5);
  });

  it('pushes enterSettlementZoom above an equal exitToWorldZoom', () => {
    const equal: ZoomTransitionTuning = {
      enabled: true,
      enterSettlementZoom: 0.5,
      exitToWorldZoom: 0.5,
      fadeMs: DEFAULT_FADE_MS,
    };
    const fixed = clampTuning(equal);
    expect(fixed.enterSettlementZoom).toBeGreaterThan(fixed.exitToWorldZoom);
  });

  it('clamps fadeMs into a sane [0, 800] range', () => {
    expect(clampTuning({ ...tuning, fadeMs: -50 }).fadeMs).toBe(0);
    expect(clampTuning({ ...tuning, fadeMs: 5000 }).fadeMs).toBe(800);
    expect(clampTuning({ ...tuning, fadeMs: 400 }).fadeMs).toBe(400);
  });
});

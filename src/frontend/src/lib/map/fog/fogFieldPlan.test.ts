import { describe, expect, it } from 'vitest';
import {
  FOG_FIELD_DRIFT_INTERVAL_MS,
  FOG_FIELD_MAX_SIDE,
  driftBlendWeight,
  driftRenderPhase,
  fieldTargetSize,
  fieldWorldRect,
  fogFieldNeedsRender,
  fogFieldRenderReason,
  rectContains,
  visibleWorldRect,
  type FogFieldPlanInput,
} from './fogFieldPlan';

const VIEWPORT = { width: 1280, height: 800 };
const CAMERA = { x: 1000, y: -500, zoom: 0.5 };

function input(over: Partial<FogFieldPlanInput> = {}): FogFieldPlanInput {
  return {
    rendered: { rect: fieldWorldRect(CAMERA, VIEWPORT), zoom: CAMERA.zoom, atMs: 0 },
    camera: CAMERA,
    viewport: VIEWPORT,
    nowMs: 10,
    dirty: false,
    fading: false,
    drifting: false,
    ...over,
  };
}

describe('fog field geometry', () => {
  it('covers the visible rect with at least a quarter viewport on every side, within two texels of it', () => {
    const visible = visibleWorldRect(CAMERA, VIEWPORT);
    const field = fieldWorldRect(CAMERA, VIEWPORT);
    const texel = field.w / fieldTargetSize(VIEWPORT).width;

    expect(rectContains(field, visible)).toBe(true);
    expect(visible.x - field.x).toBeGreaterThanOrEqual(visible.w / 4);
    expect(visible.x - field.x).toBeLessThanOrEqual(visible.w / 4 + 2 * texel);
    expect(field.x + field.w - (visible.x + visible.w)).toBeGreaterThanOrEqual(visible.w / 4);
    expect(field.x + field.w - (visible.x + visible.w)).toBeLessThanOrEqual(visible.w / 4 + 2 * texel);
    expect(visible.y - field.y).toBeGreaterThanOrEqual(visible.h / 4);
    expect(field.w).toBeCloseTo(visible.w * 1.5, -1);
  });

  it('uses 2 CSS pixels per texel (plus the snapping texel) and caps the side', () => {
    expect(fieldTargetSize(VIEWPORT)).toEqual({ width: 961, height: 601 });
    expect(fieldTargetSize({ width: 8000, height: 100 })).toEqual({ width: FOG_FIELD_MAX_SIDE, height: 76 });
  });

  it('snaps the origin to the world-space texel grid, so renders at the same zoom sample the same points', () => {
    const size = fieldTargetSize(VIEWPORT);
    const rectA = fieldWorldRect(CAMERA, VIEWPORT);
    const rectB = fieldWorldRect({ ...CAMERA, x: CAMERA.x + 37.3, y: CAMERA.y - 12.9 }, VIEWPORT);
    const texelW = rectA.w / size.width;
    const texelH = rectA.h / size.height;

    expect(rectB.w / size.width).toBeCloseTo(texelW, 9);
    expect(rectA.x / texelW).toBeCloseTo(Math.round(rectA.x / texelW), 6);
    expect(rectB.x / texelW).toBeCloseTo(Math.round(rectB.x / texelW), 6);
    expect(rectB.y / texelH).toBeCloseTo(Math.round(rectB.y / texelH), 6);
  });

  it('keeps covering at least what the unsnapped rect covered, at any camera position', () => {
    for (const x of [0, 0.4, 13.37, 999.9, -1234.56]) {
      const camera = { x, y: x * 0.7, zoom: 0.5 };
      const visible = visibleWorldRect(camera, VIEWPORT);
      const margin = { w: visible.w * 0.25, h: visible.h * 0.25 };
      const unsnapped = { x: visible.x - margin.w, y: visible.y - margin.h, w: visible.w * 1.5, h: visible.h * 1.5 };

      expect(rectContains(fieldWorldRect(camera, VIEWPORT), unsnapped)).toBe(true);
    }
  });
});

describe('fogFieldNeedsRender', () => {
  it('renders the first time and does not re-render an idle, undisturbed field', () => {
    expect(fogFieldNeedsRender(input({ rendered: null }))).toBe(true);
    expect(fogFieldNeedsRender(input())).toBe(false);
  });

  it('re-renders when an input changed or the reveal fade runs', () => {
    expect(fogFieldNeedsRender(input({ dirty: true }))).toBe(true);
    expect(fogFieldNeedsRender(input({ fading: true }))).toBe(true);
  });

  it('keeps the field while the camera moves inside the margin, re-renders once the visible rect leaves it', () => {
    const visible = visibleWorldRect(CAMERA, VIEWPORT);
    const insideMargin = { ...CAMERA, x: CAMERA.x + visible.w * 0.2 };
    const pastMargin = { ...CAMERA, x: CAMERA.x + visible.w * 0.3 };

    expect(fogFieldNeedsRender(input({ camera: insideMargin }))).toBe(false);
    expect(fogFieldNeedsRender(input({ camera: pastMargin }))).toBe(true);
  });

  it('re-renders when the zoom moved more than 20 percent since the render, not for less', () => {
    expect(fogFieldNeedsRender(input({ camera: { ...CAMERA, zoom: CAMERA.zoom * 1.15 } }))).toBe(false);
    expect(fogFieldNeedsRender(input({ camera: { ...CAMERA, zoom: CAMERA.zoom * 0.9 } }))).toBe(false);
    expect(fogFieldNeedsRender(input({ camera: { ...CAMERA, zoom: CAMERA.zoom * 1.25 } }))).toBe(true);
    expect(fogFieldNeedsRender(input({ camera: { ...CAMERA, zoom: CAMERA.zoom * 0.7 } }))).toBe(true);
  });

  it('re-renders at about 8 fps while the drift runs and never while it is off', () => {
    expect(fogFieldNeedsRender(input({ drifting: true, nowMs: FOG_FIELD_DRIFT_INTERVAL_MS - 1 }))).toBe(false);
    expect(fogFieldNeedsRender(input({ drifting: true, nowMs: FOG_FIELD_DRIFT_INTERVAL_MS }))).toBe(true);
    expect(fogFieldNeedsRender(input({ drifting: false, nowMs: 60_000 }))).toBe(false);
  });
});

describe('fogFieldRenderReason', () => {
  it('is a drift render only when nothing but the interval elapsed', () => {
    expect(fogFieldRenderReason(input())).toBe('none');
    expect(fogFieldRenderReason(input({ drifting: true, nowMs: FOG_FIELD_DRIFT_INTERVAL_MS }))).toBe('drift');
  });

  it('is a full render for anything else, even when the drift interval also elapsed', () => {
    const due = { drifting: true, nowMs: FOG_FIELD_DRIFT_INTERVAL_MS };
    expect(fogFieldRenderReason(input({ rendered: null }))).toBe('full');
    expect(fogFieldRenderReason(input({ ...due, dirty: true }))).toBe('full');
    expect(fogFieldRenderReason(input({ ...due, fading: true }))).toBe('full');
    expect(fogFieldRenderReason(input({ ...due, camera: { ...CAMERA, zoom: CAMERA.zoom * 2 } }))).toBe('full');
  });
});

describe('drift blend', () => {
  it('renders one drift interval ahead, scaled by the drift speed', () => {
    expect(driftRenderPhase(10, 1)).toBeCloseTo(10 + FOG_FIELD_DRIFT_INTERVAL_MS / 1000);
    expect(driftRenderPhase(10, 2)).toBeCloseTo(10 + (2 * FOG_FIELD_DRIFT_INTERVAL_MS) / 1000);
    expect(driftRenderPhase(10, 0)).toBe(10);
  });

  it('moves from the previous snapshot to the newest over one interval and clamps', () => {
    expect(driftBlendWeight(1000, 1000)).toBe(0);
    expect(driftBlendWeight(1000 + FOG_FIELD_DRIFT_INTERVAL_MS / 2, 1000)).toBeCloseTo(0.5);
    expect(driftBlendWeight(1000 + FOG_FIELD_DRIFT_INTERVAL_MS, 1000)).toBe(1);
    expect(driftBlendWeight(5000, 1000)).toBe(1);
    expect(driftBlendWeight(900, 1000)).toBe(0);
  });

  it('shows a steady drift: with renders one interval apart the blend tracks the true drift phase', () => {
    const speed = 1.5;
    const renderAt = 2000;
    const phaseAt = (ms: number) => (ms / 1000) * speed;
    const previous = driftRenderPhase(phaseAt(renderAt - FOG_FIELD_DRIFT_INTERVAL_MS), speed);
    const newest = driftRenderPhase(phaseAt(renderAt), speed);
    const shown = (t: number) => previous + (newest - previous) * driftBlendWeight(t, renderAt);

    // At the render the old newest is still shown (no jump), one interval later the new one, and in between it is linear.
    expect(shown(renderAt)).toBeCloseTo(previous);
    expect(shown(renderAt + FOG_FIELD_DRIFT_INTERVAL_MS)).toBeCloseTo(newest);
    expect(shown(renderAt + FOG_FIELD_DRIFT_INTERVAL_MS / 2)).toBeCloseTo(phaseAt(renderAt + FOG_FIELD_DRIFT_INTERVAL_MS / 2));
  });
});

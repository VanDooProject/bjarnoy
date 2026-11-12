import { describe, expect, it } from 'vitest';
import {
  FOG_FIELD_DRIFT_INTERVAL_MS,
  FOG_FIELD_MAX_SIDE,
  fieldTargetSize,
  fieldWorldRect,
  fogFieldNeedsRender,
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
  it('covers the visible rect with a quarter viewport on every side', () => {
    const visible = visibleWorldRect(CAMERA, VIEWPORT);
    const field = fieldWorldRect(CAMERA, VIEWPORT);

    expect(rectContains(field, visible)).toBe(true);
    expect(visible.x - field.x).toBeCloseTo(visible.w / 4);
    expect(field.x + field.w - (visible.x + visible.w)).toBeCloseTo(visible.w / 4);
    expect(visible.y - field.y).toBeCloseTo(visible.h / 4);
    expect(field.w).toBeCloseTo(visible.w * 1.5);
  });

  it('uses 2 screen pixels per texel and caps the side', () => {
    expect(fieldTargetSize(VIEWPORT)).toEqual({ width: 960, height: 600 });
    expect(fieldTargetSize({ width: 8000, height: 100 })).toEqual({ width: FOG_FIELD_MAX_SIDE, height: 75 });
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

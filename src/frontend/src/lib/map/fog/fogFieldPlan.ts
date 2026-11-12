// When and where the shared fog field (FogField.ts) is rendered. Pure maths with no Pixi in it, so the update rules
// are unit-testable: the field is a world-anchored texture that is expensive to compute and cheap to sample, so the
// question that matters is "does this frame need a fresh one".

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FogCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface FogViewport {
  width: number;
  height: number;
}

/** The field covers the viewport plus this fraction of the viewport on each side. */
export const FOG_FIELD_MARGIN = 0.25;
/**
 * One field texel is this many CSS pixels at the zoom the field was rendered at. The cap below coarsens the texels once
 * the viewport is wider than ~2730 CSS px (2048 texels cover the viewport plus its margins, 1.5x the viewport).
 */
export const FOG_FIELD_TEXEL_PX = 2;
/** Longest side of the field's render target, in texels. */
export const FOG_FIELD_MAX_SIDE = 2048;
/** While the cloud drift runs the field is re-rendered at most this often (~8 fps). */
export const FOG_FIELD_DRIFT_INTERVAL_MS = 125;
/** A zoom change past this fraction since the last render re-renders the field (the texel size is no longer ~2 px). */
export const FOG_FIELD_ZOOM_TOLERANCE = 0.2;

/** The world rectangle the screen shows. */
export function visibleWorldRect(camera: FogCamera, viewport: FogViewport): WorldRect {
  const w = viewport.width / camera.zoom;
  const h = viewport.height / camera.zoom;
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
}

/**
 * The world rectangle a field rendered for this camera covers: the visible rectangle plus a margin on every side, snapped
 * outwards to the field's own texel grid. The grid is anchored at world origin (its lines sit at multiples of the world
 * size of one texel), so two renders at the same zoom sample the world at the same points whatever the camera did in
 * between, and a re-render does not shimmer. The rect is one texel wider than the unsnapped one on each axis so that it
 * still covers everything the unsnapped rect did; `fieldTargetSize` has the matching texel count.
 */
export function fieldWorldRect(camera: FogCamera, viewport: FogViewport): WorldRect {
  const visible = visibleWorldRect(camera, viewport);
  const mx = visible.w * FOG_FIELD_MARGIN;
  const my = visible.h * FOG_FIELD_MARGIN;
  const size = fieldTargetSize(viewport);
  const texelW = (visible.w + 2 * mx) / (size.width - 1);
  const texelH = (visible.h + 2 * my) / (size.height - 1);
  return {
    x: Math.floor((visible.x - mx) / texelW) * texelW,
    y: Math.floor((visible.y - my) / texelH) * texelH,
    w: size.width * texelW,
    h: size.height * texelH,
  };
}

/**
 * The render target's size in texels: `FOG_FIELD_TEXEL_PX` CSS pixels per texel over the covered rectangle, plus the one
 * texel the grid snapping needs, with the whole side capped at `FOG_FIELD_MAX_SIDE`.
 */
export function fieldTargetSize(viewport: FogViewport): { width: number; height: number } {
  const span = 1 + 2 * FOG_FIELD_MARGIN;
  const side = (px: number) =>
    Math.min(FOG_FIELD_MAX_SIDE - 1, Math.max(1, Math.ceil((px * span) / FOG_FIELD_TEXEL_PX))) + 1;
  return { width: side(viewport.width), height: side(viewport.height) };
}

export function rectContains(outer: WorldRect, inner: WorldRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** What the field was last rendered for. */
export interface FogFieldRendered {
  rect: WorldRect;
  zoom: number;
  atMs: number;
}

export interface FogFieldPlanInput {
  /** Null before the first render. */
  rendered: FogFieldRendered | null;
  camera: FogCamera;
  viewport: FogViewport;
  nowMs: number;
  /** Something the field depends on changed since the last render: mask texture, placement, army sources, debug view, resize. */
  dirty: boolean;
  /** The reveal cross-fade is running (the mask blend moves every frame). */
  fading: boolean;
  /** The cloud drift is on (drift flag and fog motion allowed). */
  drifting: boolean;
}

/**
 * Why this frame has to re-render the field, if it does. 'drift' is the periodic cloud-drift render (the field is
 * otherwise unchanged, so the composite can cross-fade from the previous snapshot to the new one); 'full' is anything
 * else (first render, an input changed, camera or zoom left the covered rect, the reveal fade runs), where the composite
 * shows the new render alone so nothing lags or ghosts.
 */
export type FogFieldRenderReason = 'none' | 'drift' | 'full';

export function fogFieldRenderReason(input: FogFieldPlanInput): FogFieldRenderReason {
  const { rendered, camera, viewport, nowMs } = input;
  if (!rendered || input.dirty || input.fading) return 'full';
  if (!rectContains(rendered.rect, visibleWorldRect(camera, viewport))) return 'full';
  if (Math.abs(camera.zoom / rendered.zoom - 1) > FOG_FIELD_ZOOM_TOLERANCE) return 'full';
  return input.drifting && nowMs - rendered.atMs >= FOG_FIELD_DRIFT_INTERVAL_MS ? 'drift' : 'none';
}

/** Whether this frame has to re-render the field; when it is false the previous texture is drawn unchanged. */
export function fogFieldNeedsRender(input: FogFieldPlanInput): boolean {
  return fogFieldRenderReason(input) !== 'none';
}

/**
 * The drift clock a periodic drift render is rendered at: one drift interval ahead of now. The composite shows the
 * previous snapshot fading into this one over the following interval, so it lands on this phase exactly when the next
 * render replaces it, and the clouds move steadily instead of jumping 8 times a second. `speed` is the drift speed
 * multiplier `driftPhase` was accumulated with.
 */
export function driftRenderPhase(driftPhase: number, speed: number): number {
  return driftPhase + (FOG_FIELD_DRIFT_INTERVAL_MS / 1000) * speed;
}

/** How far the composite has moved from the previous snapshot to the newest one: 0 at the render, 1 one drift interval later. */
export function driftBlendWeight(nowMs: number, newestRenderedAtMs: number): number {
  return Math.min(1, Math.max(0, (nowMs - newestRenderedAtMs) / FOG_FIELD_DRIFT_INTERVAL_MS));
}

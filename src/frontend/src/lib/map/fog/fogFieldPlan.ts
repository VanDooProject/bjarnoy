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
/** One field texel is this many screen pixels at the zoom the field was rendered at. */
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

/** The world rectangle a field rendered for this camera covers: the visible rectangle plus a margin on every side. */
export function fieldWorldRect(camera: FogCamera, viewport: FogViewport): WorldRect {
  const visible = visibleWorldRect(camera, viewport);
  const mx = visible.w * FOG_FIELD_MARGIN;
  const my = visible.h * FOG_FIELD_MARGIN;
  return { x: visible.x - mx, y: visible.y - my, w: visible.w + 2 * mx, h: visible.h + 2 * my };
}

/** The render target's size in texels: 2 screen pixels per texel over the covered rectangle, capped per side. */
export function fieldTargetSize(viewport: FogViewport): { width: number; height: number } {
  const span = 1 + 2 * FOG_FIELD_MARGIN;
  const side = (px: number) => Math.min(FOG_FIELD_MAX_SIDE, Math.max(1, Math.ceil((px * span) / FOG_FIELD_TEXEL_PX)));
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

/** Whether this frame has to re-render the field; when it is false the previous texture is drawn unchanged. */
export function fogFieldNeedsRender(input: FogFieldPlanInput): boolean {
  const { rendered, camera, viewport, nowMs } = input;
  if (!rendered || input.dirty || input.fading) return true;
  if (!rectContains(rendered.rect, visibleWorldRect(camera, viewport))) return true;
  if (Math.abs(camera.zoom / rendered.zoom - 1) > FOG_FIELD_ZOOM_TOLERANCE) return true;
  return input.drifting && nowMs - rendered.atMs >= FOG_FIELD_DRIFT_INTERVAL_MS;
}

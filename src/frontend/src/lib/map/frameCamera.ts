/** A camera as the map renderer keeps it: the world point at the canvas centre, and the zoom (screen px per world px). */
export interface FrameCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface FrameOptions {
  /** Space kept free round the points, in screen px. */
  margin: number;
  /** What a sheet covers at the bottom of the canvas, in screen px: points must stay above it. */
  bottomInset: number;
  /** The furthest the camera zooms out to fit, so what it frames stays tappable. */
  minZoom: number;
}

/**
 * The smallest camera move that brings every world point into the visible part of the canvas, or `null` when they are all
 * there already, so the camera stays where the player left it. It zooms out only as far as the points need and never in, and
 * it pans only by what sticks out, not to a new centre. Points that do not fit even at `minZoom` are centred on that axis.
 */
export function frameCameraFor(
  camera: FrameCamera,
  viewport: { width: number; height: number },
  points: readonly { x: number; y: number }[],
  opts: FrameOptions,
): FrameCamera | null {
  if (points.length === 0) return null;
  const left = opts.margin;
  const right = viewport.width - opts.margin;
  const top = opts.margin;
  const bottom = viewport.height - Math.max(0, opts.bottomInset) - opts.margin;
  const availW = Math.max(1, right - left);
  const availH = Math.max(1, bottom - top);

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const fit = Math.min(availW / Math.max(1e-9, maxX - minX), availH / Math.max(1e-9, maxY - minY));
  const zoom = Math.min(camera.zoom, Math.max(opts.minZoom, fit));

  // Screen position of a world coordinate on one axis, with the camera centre unchanged at the new zoom.
  const shiftFor = (min: number, max: number, centre: number, size: number, lo: number, hi: number): number => {
    const sMin = size / 2 + (min - centre) * zoom;
    const sMax = size / 2 + (max - centre) * zoom;
    if (sMax - sMin > hi - lo) return (lo + hi) / 2 - (sMin + sMax) / 2;
    if (sMin < lo) return lo - sMin;
    if (sMax > hi) return hi - sMax;
    return 0;
  };
  const dx = shiftFor(minX, maxX, camera.x, viewport.width, left, right);
  const dy = shiftFor(minY, maxY, camera.y, viewport.height, top, bottom);
  if (dx === 0 && dy === 0 && zoom === camera.zoom) return null;
  // Moving the content right on screen by dx means the camera centre moves left by dx / zoom in world px.
  return { x: camera.x - dx / zoom, y: camera.y - dy / zoom, zoom };
}

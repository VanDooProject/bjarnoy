export interface Camera {
  /** World-space pixel coordinates the camera is centred on. */
  x: number;
  y: number;
  zoom: number;
}

export function screenToWorld(
  camera: Camera,
  screen: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (screen.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (screen.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

export function worldToScreen(
  camera: Camera,
  world: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (world.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (world.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function visibleWorldRect(
  camera: Camera,
  viewport: { width: number; height: number },
  margin = 0,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfW = viewport.width / 2 / camera.zoom + margin;
  const halfH = viewport.height / 2 / camera.zoom + margin;
  return {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  };
}

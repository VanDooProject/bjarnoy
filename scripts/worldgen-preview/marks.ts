// Marker shapes the preview overlays draw into an RGB buffer: filled and hollow shapes with a
// dark outline (so a marker reads on grass, sand, mountain and sea alike) and a thin ring.
import type { MarkerShape, Rgb } from './layers';

const OUTLINE: Rgb = [10, 10, 14];

/** Whether the point (dx, dy) relative to a marker's centre lies inside a shape of the given radius. */
function inside(shape: MarkerShape, dx: number, dy: number, r: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  switch (shape) {
    case 'disc':
      return dx * dx + dy * dy <= r * r;
    case 'hollowDisc': {
      const d = Math.hypot(dx, dy);
      return d <= r && d >= r * 0.55;
    }
    case 'square':
      return ax <= r * 0.85 && ay <= r * 0.85;
    case 'hollowSquare':
      return ax <= r * 0.85 && ay <= r * 0.85 && (ax >= r * 0.45 || ay >= r * 0.45);
    case 'diamond':
      return ax + ay <= r * 1.1;
    case 'hollowDiamond':
      return ax + ay <= r * 1.1 && ax + ay >= r * 0.6;
    case 'triangle':
      // Apex up: width grows towards the bottom.
      return dy >= -r && dy <= r * 0.8 && ax <= (dy + r) * 0.55;
    case 'triangleDown':
      return dy >= -r * 0.8 && dy <= r && ax <= (r - dy) * 0.55;
    case 'cross':
      return (ax <= r * 0.3 && ay <= r) || (ay <= r * 0.3 && ax <= r);
    case 'x':
      return Math.abs(ax - ay) <= r * 0.35 && ax <= r && ay <= r;
    case 'ring':
      return false;
  }
}

function put(rgb: Uint8Array, width: number, height: number, x: number, y: number, colour: Rgb): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const o = (y * width + x) * 3;
  rgb[o] = colour[0];
  rgb[o + 1] = colour[1];
  rgb[o + 2] = colour[2];
}

/**
 * Draws one marker centred at (cx, cy) pixels. `ring` is a one-pixel circle of the given radius
 * (used for guard ranges); every other shape is filled (or hollow) with a one-pixel dark outline.
 */
export function drawMarker(
  rgb: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  shape: MarkerShape,
  radius: number,
  colour: Rgb,
): void {
  const reach = Math.ceil(radius) + 2;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  if (shape === 'ring') {
    for (let y = y0 - reach; y <= y0 + reach; y++) {
      for (let x = x0 - reach; x <= x0 + reach; x++) {
        if (Math.abs(Math.hypot(x - cx, y - cy) - radius) < 0.75) put(rgb, width, height, x, y, colour);
      }
    }
    return;
  }
  for (let y = y0 - reach; y <= y0 + reach; y++) {
    for (let x = x0 - reach; x <= x0 + reach; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (inside(shape, dx, dy, radius)) put(rgb, width, height, x, y, colour);
    }
  }
  // Outline: a pixel just outside the shape (not inside itself), next to a pixel inside it.
  for (let y = y0 - reach; y <= y0 + reach; y++) {
    for (let x = x0 - reach; x <= x0 + reach; x++) {
      if (inside(shape, x - cx, y - cy, radius)) continue;
      let touches = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (inside(shape, x + ox - cx, y + oy - cy, radius)) touches = true;
      }
      if (touches) put(rgb, width, height, x, y, OUTLINE);
    }
  }
}

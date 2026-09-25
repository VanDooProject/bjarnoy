// Builds the shared white "mist" texture the glow-mist effect tints per hex
// (see glowMist.ts for the falloff/colour math, HexMapRenderer.ts for how
// this gets placed and animated). Built lazily from an offscreen canvas —
// never at module load, since jsdom/test environments and any renderer
// created before a real `<canvas>` context is needed shouldn't pay for this.

import { Texture } from "pixi.js";

const SIZE = 256;

/**
 * One seeded blob layout: a handful of overlapping radial gradients,
 * brightest near the bottom-centre and fading to fully transparent at the
 * canvas edges, so the sprite reads as mist "rising" from the hex behind it
 * rather than a stamped circle. Each variant nudges the blob centres/radii a
 * little so neighbouring hexes sharing this texture don't look identical.
 */
interface BlobSpec {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

function blobsForSeed(seed: number): BlobSpec[] {
  // Small deterministic jitter from the seed alone — no Math.random, so the
  // same variant index always builds the same texture.
  const jitter = (n: number) =>
    Math.sin(seed * 12.9898 + n * 78.233) * 0.5 + 0.5;
  return [
    // the body: low and wide, kept clear of the canvas edges so nothing is
    // cut off square (the bottom fade below then takes it to zero)
    {
      x: 0.5 + (jitter(1) - 0.5) * 0.12,
      y: 0.68,
      r: 0.3 + jitter(2) * 0.05,
      alpha: 0.8,
    },
    {
      x: 0.3 + (jitter(3) - 0.5) * 0.12,
      y: 0.62,
      r: 0.2 + jitter(4) * 0.05,
      alpha: 0.6,
    },
    {
      x: 0.7 + (jitter(5) - 0.5) * 0.12,
      y: 0.64,
      r: 0.2 + jitter(6) * 0.05,
      alpha: 0.6,
    },
    // wisps rising off it
    {
      x: 0.38 + (jitter(7) - 0.5) * 0.2,
      y: 0.4,
      r: 0.14 + jitter(8) * 0.05,
      alpha: 0.4,
    },
    {
      x: 0.62 + (jitter(9) - 0.5) * 0.2,
      y: 0.32,
      r: 0.12 + jitter(10) * 0.05,
      alpha: 0.3,
    },
  ];
}

function buildMistCanvas(seed: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = "lighter";
  for (const blob of blobsForSeed(seed)) {
    const cx = blob.x * SIZE;
    const cy = blob.y * SIZE;
    const radius = blob.r * SIZE;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${blob.alpha})`);
    gradient.addColorStop(0.5, `rgba(255,255,255,${blob.alpha * 0.45})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fade the bottom to nothing: the sprite's bottom edge sits on the hex's
  // front edge, and any alpha left there draws a straight line across the
  // ground (a row of them read as hex-shaped stripes).
  ctx.globalCompositeOperation = "destination-in";
  const fade = ctx.createLinearGradient(0, 0, 0, SIZE);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(0.2, "rgba(255,255,255,1)");
  fade.addColorStop(0.7, "rgba(255,255,255,1)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return canvas;
}

/** How many deterministic texture variants `mistTextureVariant` builds. */
export const MIST_TEXTURE_VARIANT_COUNT = 3;

let cachedVariants: Texture[] | null = null;

/**
 * The shared mist textures, built once (lazily) and cached for the process's
 * lifetime — every mist sprite across every hex reuses one of these few
 * `Texture` instances, tinted per-hex via `sprite.tint`.
 */
export function mistTextures(): Texture[] {
  if (!cachedVariants) {
    cachedVariants = Array.from(
      { length: MIST_TEXTURE_VARIANT_COUNT },
      (_, i) => Texture.from(buildMistCanvas(i)),
    );
  }
  return cachedVariants;
}

/** Picks one of the cached variants deterministically from a hex-derived hash. */
export function mistTextureVariant(hash: number): Texture {
  const textures = mistTextures();
  const index = ((hash % textures.length) + textures.length) % textures.length;
  return textures[index]!;
}

/** Test-only: drops the cache so a test can rebuild against a fresh canvas mock. */
export function resetMistTextureCacheForTest(): void {
  cachedVariants = null;
}

// Pure math for the "glow mist" effect: on a revealed wasted island, a soft
// coloured mist rises from hexes near light sources (the Utgard giant
// fortress, lava/volcano tiles), so dark buildings/mountains get a glowing
// aura "creeping from behind" them. No Pixi import here on purpose — the
// falloff/colour math is unit-testable without a renderer, and
// `HexMapRenderer.ts` is the only thing that turns this into sprites.

import {
  coordKey,
  hexDistance,
  hexesInRadius,
  type AxialCoord,
} from "../hex/coords";
import type { RiverTile, Tile } from "./types";

export type GlowKind = "rune" | "ember";

/** Teal, for the Utgard giant fortress's rune-light; ember, for lava. */
export const GLOW_COLORS: Record<GlowKind, number> = {
  rune: 0x5ce1e6,
  ember: 0xd2591f,
};

/**
 * Which glow (if any) a hex emits, from its own tile/river data. Only a
 * hex's own giant-anchor coverage or its own river tile matters here — the
 * radius-based spread to *nearby* hexes is `computeGlowMist`'s job, not
 * this function's.
 */
export function glowKindFor(
  tile: Tile,
  river: RiverTile | undefined,
): GlowKind | null {
  if (tile.giant?.family === "giantutgard") return "rune";
  if (tile.giant?.family === "giantvolcano" && tile.wasted) return "ember";
  if (river?.wasted) return "ember";
  return null;
}

/**
 * How strong each kind's mist is at its own hex. Ember is a saturated orange
 * that reads loudly on the dark wasteland at any alpha; the rune teal is
 * paler and needs more alpha to separate a dark fortress from dark ground.
 */
export const GLOW_STRENGTH: Record<GlowKind, number> = {
  rune: 1,
  ember: 0.75,
};

export interface GlowMistEmitter {
  coord: AxialCoord;
  kind: GlowKind;
}

export interface GlowMistHex {
  coord: AxialCoord;
  intensity: number;
  color: number;
}

/**
 * For every hex within `radius` hex-steps of any emitter, and for which
 * `isMistHex` holds, the mist that hex should show: `intensity` is the
 * strongest single emitter's falloff weight (times its kind's
 * `GLOW_STRENGTH`) reaching it (not a sum — several
 * nearby emitters don't stack into a brighter mist than any one of them
 * alone would give), and `color` is the weight-averaged colour of every
 * emitter contributing to that intensity's own weight (so a hex equidistant
 * from a rune and an ember source reads as a blend of both, not just
 * whichever happened to be found first).
 *
 * `w = (1 - d/(radius+1))^2` — 1 at the emitter's own hex (d=0), falling to
 * (radius/(radius+1))^2 at the last included ring, and to exactly 0 (thus
 * excluded) once d > radius, matching the doc's "falloff is zero beyond
 * radius".
 */
export function computeGlowMist(
  emitters: GlowMistEmitter[],
  isMistHex: (c: AxialCoord) => boolean,
  radius = 3,
): Map<string, GlowMistHex> {
  const weightSum = new Map<string, number>();
  const maxWeight = new Map<string, number>();
  const colorSum = new Map<string, { r: number; g: number; b: number }>();
  const coordByKey = new Map<string, AxialCoord>();

  for (const emitter of emitters) {
    const color = GLOW_COLORS[emitter.kind];
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    for (const hex of hexesInRadius(emitter.coord, radius)) {
      const d = hexDistance(emitter.coord, hex);
      if (d > radius) continue;
      if (!isMistHex(hex)) continue;
      const k = coordKey(hex);
      const w = Math.pow(1 - d / (radius + 1), 2);

      coordByKey.set(k, hex);
      maxWeight.set(
        k,
        Math.max(maxWeight.get(k) ?? 0, w * GLOW_STRENGTH[emitter.kind]),
      );
      weightSum.set(k, (weightSum.get(k) ?? 0) + w);
      const acc = colorSum.get(k) ?? { r: 0, g: 0, b: 0 };
      acc.r += r * w;
      acc.g += g * w;
      acc.b += b * w;
      colorSum.set(k, acc);
    }
  }

  const result = new Map<string, GlowMistHex>();
  for (const [k, coord] of coordByKey) {
    const intensity = maxWeight.get(k)!;
    const wSum = weightSum.get(k)!;
    const acc = colorSum.get(k)!;
    const r = Math.round(acc.r / wSum);
    const g = Math.round(acc.g / wSum);
    const b = Math.round(acc.b / wSum);
    const color = (r << 16) | (g << 8) | b;
    result.set(k, { coord, intensity, color });
  }
  return result;
}

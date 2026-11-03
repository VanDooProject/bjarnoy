// What the server's fog mask says about the ground, as per-hex lookups the client can ask without touching a texture.
//
// The renderer's terrain cull and `WorldModel.isExplored` used to derive explored ground from client-side vision alone,
// so after a reload ground explored by a settlement that has since lost its Longhouse (no vision discs any more) was
// greyed in the mask but culled from the terrain. The mask already carries it: its R channel is 0 on every explored hex
// (persisted history included) and ramps to 255 away from current vision. `FogCoverage` is that channel, built once per
// mask update (one linear pass over the hex texels plus a one-hex dilation) and queried per hex afterwards.
import { FOG_MIST_OPAQUE_AT_RAMP } from './fogRamp';
import type { MaskBounds } from './fogMaskLayout';

/** The smallest R byte at which the mist is provably fully opaque (the shader's `FOG_MIST_OPAQUE_AT_RAMP`). */
const OPAQUE_R = Math.ceil(255 * FOG_MIST_OPAQUE_AT_RAMP);

// A hex's six neighbours in texel space (u, v +- 2 and u +- 1, v +- 1).
const NEIGHBOUR_TEXELS: ReadonlyArray<readonly [number, number]> = [
  [0, -2],
  [0, 2],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const NO_SPANS: readonly number[] = Object.freeze([]) as readonly number[];

export class FogCoverage {
  /** Changes iff the set of non-opaque hexes (`isOpaque` false) changes — the renderer rebuilds terrain on it. */
  readonly signature: string;
  private readonly bounds: MaskBounds;
  private readonly pixels: Uint8ClampedArray;
  /** 1 on a hex texel whose own or any neighbouring hex texel has R below `OPAQUE_R`; indexed like the pixels. */
  private readonly clear: Uint8Array;
  /** Per column (`u - minU`): merged axial-r intervals `[lo, hi, ...]` of the non-opaque hexes. */
  private readonly spans: Array<readonly number[]>;

  constructor(bounds: MaskBounds, pixels: Uint8ClampedArray) {
    this.bounds = bounds;
    this.pixels = pixels;
    const { minU, minV, maxU, maxV, width, height } = bounds;
    this.clear = new Uint8Array(width * height);
    this.spans = new Array<readonly number[]>(width).fill(NO_SPANS);

    const needsClear = (u: number, v: number): boolean => {
      if (u < minU || u >= maxU || v < minV || v >= maxV) return false;
      return pixels[((v - minV) * width + (u - minU)) * 4] < OPAQUE_R;
    };

    const parts: string[] = [];
    for (let u = minU; u < maxU; u++) {
      const parity = u & 1;
      const offset = (u - parity) / 2;
      const spans: number[] = [];
      // v = 2 * row + parity, so stepping v by 2 walks the column's hexes in ascending row (and so r) order.
      let v = minV + (((minV & 1) === parity) ? 0 : 1);
      for (; v < maxV; v += 2) {
        let isClear = needsClear(u, v);
        for (let n = 0; !isClear && n < NEIGHBOUR_TEXELS.length; n++) {
          isClear = needsClear(u + NEIGHBOUR_TEXELS[n][0], v + NEIGHBOUR_TEXELS[n][1]);
        }
        if (!isClear) continue;
        this.clear[(v - minV) * width + (u - minU)] = 1;
        const r = (v - parity) / 2 - offset;
        const last = spans.length - 1;
        if (last > 0 && spans[last] + 1 === r) spans[last] = r;
        else spans.push(r, r);
      }
      if (spans.length > 0) {
        this.spans[u - minU] = spans;
        parts.push(`${u}:${spans.join(',')}`);
      }
    }
    this.signature = parts.join('|');
  }

  /** Whether the server marks this hex explored: inside the mask and unknown ramp 0. */
  isExplored(q: number, r: number): boolean {
    const texel = this.texelIndex(q, r);
    return texel >= 0 && this.pixels[texel * 4] === 0;
  }

  /**
   * Whether the mist over this hex is provably fully opaque — so nothing drawn there can show. False when the hex's own
   * texel or any neighbouring hex's is below `OPAQUE_R`: bilinear filtering and sprite overhang make a hex beside
   * non-opaque mist partially visible, and server history ground has a hard 0 -> 255 edge. Outside the mask is opaque.
   */
  isOpaque(q: number, r: number): boolean {
    const texel = this.texelIndex(q, r);
    return texel < 0 || this.clear[texel] === 0;
  }

  /** The merged axial-r intervals `[lo, hi, lo, hi, ...]` (ascending, inclusive) of column `q`'s non-opaque hexes. */
  rSpans(q: number): readonly number[] {
    const i = q - this.bounds.minU;
    return i < 0 || i >= this.bounds.width ? NO_SPANS : this.spans[i];
  }

  /** Whether any non-opaque hex lies in columns `qMin..qMax` and offset rows `rowMin..rowMax` (all inclusive). */
  anyClearIn(qMin: number, qMax: number, rowMin: number, rowMax: number): boolean {
    const from = Math.max(qMin, this.bounds.minU);
    const to = Math.min(qMax, this.bounds.maxU - 1);
    for (let q = from; q <= to; q++) {
      const spans = this.spans[q - this.bounds.minU];
      if (spans.length === 0) continue;
      const offset = (q - (q & 1)) / 2;
      const rMin = rowMin - offset;
      const rMax = rowMax - offset;
      for (let i = 0; i < spans.length; i += 2) {
        if (spans[i] <= rMax && spans[i + 1] >= rMin) return true;
      }
    }
    return false;
  }

  /** Index of the hex's texel in the mask, or -1 outside it. */
  private texelIndex(q: number, r: number): number {
    const { minU, minV, maxU, maxV, width } = this.bounds;
    const parity = q & 1;
    const v = 2 * (r + (q - parity) / 2) + parity;
    if (q < minU || q >= maxU || v < minV || v >= maxV) return -1;
    return (v - minV) * width + (q - minU);
  }
}

/**
 * `FogCoverage`'s public surface. What is handed around (Pinia state unwraps a class to its public members only, so the
 * class type itself would not match what the store gives back).
 */
export type FogCoverageLookup = Pick<FogCoverage, keyof FogCoverage>;

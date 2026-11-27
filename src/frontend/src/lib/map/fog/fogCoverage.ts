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

/**
 * The server's whole-world overview (`fog-overview`), decoded: one pixel per `factor` x `factor` block of detailed mask
 * texels. The shader shows it wherever the chunk window has no data, so the per-hex lookups answer from it there too.
 */
export interface FogOverviewPixels {
  /** The area the overview covers, in detailed texels (aligned to `factor`). */
  bounds: MaskBounds;
  factor: number;
  width: number;
  height: number;
  /** RGBA, `width` x `height`. */
  pixels: Uint8ClampedArray;
}

/** Appends `[lo, hi]` to ascending `spans`, merging it into the last interval when they touch or overlap. */
function pushSpan(spans: number[], lo: number, hi: number): void {
  const last = spans.length - 1;
  if (last > 0 && spans[last] + 1 >= lo) spans[last] = Math.max(spans[last], hi);
  else spans.push(lo, hi);
}

export class FogCoverage {
  /** Changes iff the set of non-opaque hexes (`isOpaque` false) changes — the renderer rebuilds terrain on it. */
  readonly signature: string;
  private readonly bounds: MaskBounds;
  private readonly pixels: Uint8ClampedArray;
  private readonly overview: FogOverviewPixels | null;
  /** 1 on a hex texel whose own or any neighbouring hex texel has R below `OPAQUE_R`; indexed like the pixels. */
  private readonly clear: Uint8Array;
  /** The same per overview block (its own or any of its 8 neighbour blocks has R below `OPAQUE_R`). */
  private readonly blockClear: Uint8Array;
  /** First column of `spans`: the lower of the window's and the overview's first column. */
  private readonly spanMinU: number;
  /** Per column (`u - spanMinU`): merged axial-r intervals `[lo, hi, ...]` of the non-opaque hexes. */
  private readonly spans: Array<readonly number[]>;

  constructor(bounds: MaskBounds, pixels: Uint8ClampedArray, overview?: FogOverviewPixels | null) {
    this.bounds = bounds;
    this.pixels = pixels;
    this.overview = overview ?? null;
    const { minU, minV, maxU, maxV, width, height } = bounds;
    this.clear = new Uint8Array(width * height);
    this.blockClear = new Uint8Array(this.overview ? this.overview.width * this.overview.height : 0);

    const needsClear = (u: number, v: number): boolean => {
      if (u < minU || u >= maxU || v < minV || v >= maxV) return false;
      return pixels[((v - minV) * width + (u - minU)) * 4] < OPAQUE_R;
    };

    // The window: per column its merged r-spans, exactly as without an overview.
    const windowSpans = new Array<readonly number[]>(width).fill(NO_SPANS);
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
        pushSpan(spans, (v - parity) / 2 - offset, (v - parity) / 2 - offset);
      }
      if (spans.length > 0) windowSpans[u - minU] = spans;
    }

    const ov = this.overview;
    const colHasClear = ov ? this.buildBlockClear(ov) : null;
    const ovMinU = ov ? ov.bounds.minU : minU;
    const ovMaxU = ov ? ov.bounds.maxU : maxU;
    this.spanMinU = Math.min(minU, ovMinU);
    const spanMaxU = Math.max(maxU, ovMaxU);
    this.spans = new Array<readonly number[]>(Math.max(0, spanMaxU - this.spanMinU)).fill(NO_SPANS);

    const parts: string[] = [];
    for (let u = this.spanMinU; u < spanMaxU; u++) {
      const inWindow = u >= minU && u < maxU;
      let spans: readonly number[] = inWindow ? windowSpans[u - minU] : NO_SPANS;
      if (ov && colHasClear && u >= ov.bounds.minU && u < ov.bounds.maxU
        && colHasClear[Math.floor((u - ov.bounds.minU) / ov.factor)] === 1) {
        spans = this.mergeOverviewColumn(u, spans, inWindow, ov);
      }
      if (spans.length === 0) continue;
      this.spans[u - this.spanMinU] = spans;
      parts.push(`${u}:${spans.join(',')}`);
    }
    this.signature = parts.join('|');
  }

  /**
   * Fills `blockClear` (a block is clear when its own or any of its 8 neighbour blocks has R below `OPAQUE_R` — bilinear
   * filtering spreads one block, the overview's counterpart of the window's one-hex dilation) and returns, per block
   * column, whether it holds any clear block.
   */
  private buildBlockClear(ov: FogOverviewPixels): Uint8Array {
    const { width, height, pixels } = ov;
    const low = (c: number, row: number): boolean =>
      c >= 0 && c < width && row >= 0 && row < height && pixels[(row * width + c) * 4] < OPAQUE_R;
    const colHasClear = new Uint8Array(width);
    for (let row = 0; row < height; row++) {
      for (let c = 0; c < width; c++) {
        let isClear = false;
        for (let dr = -1; !isClear && dr <= 1; dr++) {
          for (let dc = -1; !isClear && dc <= 1; dc++) isClear = low(c + dc, row + dr);
        }
        if (!isClear) continue;
        this.blockClear[row * width + c] = 1;
        colHasClear[c] = 1;
      }
    }
    return colHasClear;
  }

  /**
   * Column `u`'s r-spans with the overview's clear blocks added: rows inside the window's v-range keep the window's own
   * spans (`windowSpans`), every other row comes from the overview.
   */
  private mergeOverviewColumn(
    u: number, windowSpans: readonly number[], inWindow: boolean, ov: FogOverviewPixels,
  ): readonly number[] {
    const parity = u & 1;
    const offset = (u - parity) / 2;
    const blockCol = Math.floor((u - ov.bounds.minU) / ov.factor);

    // The window's rows of this column, as inclusive row indices (v = 2 * row + parity).
    let hasWindowRows = false;
    let winLo = 0;
    let winHi = 0;
    if (inWindow) {
      const first = this.bounds.minV + (((this.bounds.minV & 1) === parity) ? 0 : 1);
      if (first < this.bounds.maxV) {
        hasWindowRows = true;
        winLo = (first - parity) / 2;
        winHi = (first + 2 * Math.floor((this.bounds.maxV - 1 - first) / 2) - parity) / 2;
      }
    }

    const overviewSpans: number[] = [];
    for (let br = 0; br < ov.height; br++) {
      if (this.blockClear[br * ov.width + blockCol] === 0) continue;
      const vLo = ov.bounds.minV + br * ov.factor;
      const rowLo = Math.ceil((vLo - parity) / 2);
      const rowHi = Math.floor((vLo + ov.factor - 1 - parity) / 2);
      if (rowLo <= rowHi) pushSpan(overviewSpans, rowLo, rowHi);
    }

    const merged: number[] = [];
    // Overview rows below the window's range, then the window's own spans, then the overview rows above it.
    const below = hasWindowRows ? winLo - 1 : Infinity;
    const above = hasWindowRows ? winHi + 1 : -Infinity;
    for (let i = 0; i < overviewSpans.length; i += 2) {
      const hi = Math.min(overviewSpans[i + 1], below);
      if (overviewSpans[i] <= hi) pushSpan(merged, overviewSpans[i] - offset, hi - offset);
    }
    for (let i = 0; i < windowSpans.length; i += 2) pushSpan(merged, windowSpans[i], windowSpans[i + 1]);
    if (hasWindowRows) {
      for (let i = 0; i < overviewSpans.length; i += 2) {
        const lo = Math.max(overviewSpans[i], above);
        if (lo <= overviewSpans[i + 1]) pushSpan(merged, lo - offset, overviewSpans[i + 1] - offset);
      }
    }
    return merged;
  }

  /** Whether the server marks this hex explored: unknown ramp 0 in the window, or an overview block that is fully explored. */
  isExplored(q: number, r: number): boolean {
    const texel = this.texelIndex(q, r);
    if (texel >= 0) return this.pixels[texel * 4] === 0;
    const block = this.blockIndex(q, r);
    return block >= 0 && this.overview!.pixels[block * 4] === 0;
  }

  /**
   * Whether the mist over this hex is provably fully opaque — so nothing drawn there can show. False when the hex's own
   * texel or any neighbouring hex's is below `OPAQUE_R`: bilinear filtering and sprite overhang make a hex beside
   * non-opaque mist partially visible, and sprite overhang reaches past a hex's own texel. Past the window the hex's
   * overview block answers the same way (own or neighbouring block). Outside both is opaque.
   */
  isOpaque(q: number, r: number): boolean {
    const texel = this.texelIndex(q, r);
    if (texel >= 0) return this.clear[texel] === 0;
    const block = this.blockIndex(q, r);
    return block < 0 || this.blockClear[block] === 0;
  }

  /** The merged axial-r intervals `[lo, hi, lo, hi, ...]` (ascending, inclusive) of column `q`'s non-opaque hexes. */
  rSpans(q: number): readonly number[] {
    const i = q - this.spanMinU;
    return i < 0 || i >= this.spans.length ? NO_SPANS : this.spans[i];
  }

  /** Whether any non-opaque hex lies in columns `qMin..qMax` and offset rows `rowMin..rowMax` (all inclusive). */
  anyClearIn(qMin: number, qMax: number, rowMin: number, rowMax: number): boolean {
    const from = Math.max(qMin, this.spanMinU);
    const to = Math.min(qMax, this.spanMinU + this.spans.length - 1);
    for (let q = from; q <= to; q++) {
      const spans = this.spans[q - this.spanMinU];
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

  /** Index of the hex's texel in the mask window, or -1 outside it. */
  private texelIndex(q: number, r: number): number {
    const { minU, minV, maxU, maxV, width } = this.bounds;
    const parity = q & 1;
    const v = 2 * (r + (q - parity) / 2) + parity;
    if (q < minU || q >= maxU || v < minV || v >= maxV) return -1;
    return (v - minV) * width + (q - minU);
  }

  /** Index of the overview block holding the hex, or -1 without an overview or outside it. */
  private blockIndex(q: number, r: number): number {
    const ov = this.overview;
    if (!ov) return -1;
    const parity = q & 1;
    const v = 2 * (r + (q - parity) / 2) + parity;
    const { minU, minV, maxU, maxV } = ov.bounds;
    if (q < minU || q >= maxU || v < minV || v >= maxV) return -1;
    return Math.floor((v - minV) / ov.factor) * ov.width + Math.floor((q - minU) / ov.factor);
  }
}

/**
 * `FogCoverage`'s public surface. What is handed around (Pinia state unwraps a class to its public members only, so the
 * class type itself would not match what the store gives back).
 */
export type FogCoverageLookup = Pick<FogCoverage, keyof FogCoverage>;

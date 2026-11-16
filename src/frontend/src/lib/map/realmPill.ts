/**
 * The "realm pill": a dark rounded plate bordered in a realm's colour, with a
 * small mark (hex or diamond) and one or more name labels. The settlement-view
 * badge and the world-map owner label are both this one element in two sizes;
 * this module is the pure geometry, `HexMapRenderer.drawRealmPill` draws it.
 */
export interface RealmPillSize {
  height: number;
  padX: number;
  markR: number;
  markGap: number;
  labelGap: number;
  border: number;
}

export const REALM_PILL = {
  badge: { height: 30, padX: 14, markR: 4.5, markGap: 9, labelGap: 6, border: 1.5 },
  owner: { height: 20, padX: 8, markR: 3.5, markGap: 6, labelGap: 5, border: 1.5 },
} as const satisfies Record<string, RealmPillSize>;

export interface RealmPillLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  markX: number;
  markY: number;
  markR: number;
  labelXs: number[];
  labelY: number;
  border: number;
}

/** Lays a pill out centred on `centerX` with its top edge at `top`; every size field is multiplied by `scale`. */
export function layoutRealmPill(
  size: RealmPillSize,
  scale: number,
  labelWidths: number[],
  centerX: number,
  top: number,
): RealmPillLayout {
  const h = size.height * scale;
  const padX = size.padX * scale;
  const markR = size.markR * scale;
  const markGap = size.markGap * scale;
  const labelGap = size.labelGap * scale;
  const labelsW = labelWidths.reduce((sum, w) => sum + w, 0);
  const w = 2 * padX + 2 * markR + markGap + labelsW + labelGap * Math.max(0, labelWidths.length - 1);
  const x = centerX - w / 2;
  const labelXs: number[] = [];
  let cursor = x + padX + 2 * markR + markGap;
  for (const lw of labelWidths) {
    labelXs.push(cursor);
    cursor += lw + labelGap;
  }
  return {
    x,
    y: top,
    w,
    h,
    radius: h / 2,
    markX: x + padX + markR,
    markY: top + h / 2,
    markR,
    labelXs,
    labelY: top + h / 2,
    border: size.border * scale,
  };
}

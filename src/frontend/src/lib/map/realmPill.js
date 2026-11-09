export const REALM_PILL = {
    badge: { height: 30, padX: 14, markR: 4.5, markGap: 9, labelGap: 6, border: 1.5 },
    owner: { height: 20, padX: 8, markR: 3.5, markGap: 6, labelGap: 5, border: 1.5 },
};
/** Lays a pill out centred on `centerX` with its top edge at `top`; every size field is multiplied by `scale`. */
export function layoutRealmPill(size, scale, labelWidths, centerX, top) {
    const h = size.height * scale;
    const padX = size.padX * scale;
    const markR = size.markR * scale;
    const markGap = size.markGap * scale;
    const labelGap = size.labelGap * scale;
    const labelsW = labelWidths.reduce((sum, w) => sum + w, 0);
    const w = 2 * padX + 2 * markR + markGap + labelsW + labelGap * Math.max(0, labelWidths.length - 1);
    const x = centerX - w / 2;
    const labelXs = [];
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

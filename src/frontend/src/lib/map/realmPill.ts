/**
 * The "realm pill": a dark rounded plate bordered in a realm's colour, with a
 * small mark (hex or diamond) and one or more name labels. The settlement-view
 * badge and the world-map owner label are both this one element in two sizes;
 * this module holds its sizes; the DOM label overlay (mapLabelOverlay.ts) writes them into the elements as CSS custom properties.
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

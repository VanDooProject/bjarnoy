/**
 * The "realm pill": a dark rounded plate bordered in a realm's colour, with a
 * small hex mark and two name labels. The settlement badge, in both the world and the settlement view, is this one element;
 * this module holds its size; the DOM label overlay (mapLabelOverlay.ts) writes them into the elements as CSS custom properties.
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
} as const satisfies Record<string, RealmPillSize>;

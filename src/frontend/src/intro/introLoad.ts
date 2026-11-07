import { reactive } from 'vue';

/** Pages (atlas pages) loaded so far out of the group's total. */
export interface LoadCount {
  loaded: number;
  total: number;
}

export type MapLoadGroup = 'terrain' | 'buildings' | 'animations';

/**
 * How far the map's assets have loaded, written by the main app (see `useIntroTilesSignal`) and read by the landing
 * intro's timeline. A group stays null until its load reports a page count (animations stay null while building
 * animations are off, since they never load then).
 */
export const introLoad = reactive<Record<MapLoadGroup, LoadCount | null>>({
  terrain: null,
  buildings: null,
  animations: null,
});

export function reportIntroLoad(group: MapLoadGroup, count: LoadCount): void {
  const cur = introLoad[group];
  if (cur && cur.loaded === count.loaded && cur.total === count.total) return;
  introLoad[group] = { loaded: count.loaded, total: count.total };
}

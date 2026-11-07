import { reactive } from 'vue';
import { introSignal } from './introSignal';

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

const MAX_UNLOADED = 0.99;

/**
 * How far the map has loaded, 0..1: the loaded pages over the total pages of the groups that have reported (terrain,
 * buildings, animations); 0 while none has; 1 only once the main app says the tiles are loaded. Until then it stays
 * below 1: the groups report one after another, so the ones that have reported can all be done while the next has not
 * started yet.
 */
export function mapLoadFraction(load: Record<MapLoadGroup, LoadCount | null> = introLoad, tilesLoaded: boolean = introSignal.tilesLoaded): number {
  if (tilesLoaded) return 1;
  let loaded = 0;
  let total = 0;
  for (const count of Object.values(load)) {
    if (!count) continue;
    loaded += count.loaded;
    total += count.total;
  }
  return total > 0 ? Math.min(MAX_UNLOADED, loaded / total) : 0;
}

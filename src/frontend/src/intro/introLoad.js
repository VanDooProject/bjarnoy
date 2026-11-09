import { reactive } from 'vue';
import { introSignal } from './introSignal';
/**
 * How far the map's assets have loaded, written by the main app (see `useIntroTilesSignal`) and read by the landing
 * intro's timeline. A group stays null until its load reports a page count (animations stay null while building
 * animations are off, since they never load then).
 */
export const introLoad = reactive({
    terrain: null,
    buildings: null,
    animations: null,
});
/** Records a group's page count. A group's `loaded` never moves backwards for the same total (a late, lower report is dropped). */
export function reportIntroLoad(group, count) {
    const cur = introLoad[group];
    if (cur && cur.total === count.total && count.loaded <= cur.loaded)
        return;
    introLoad[group] = { loaded: count.loaded, total: count.total };
}
const MAX_UNLOADED = 0.99;
/**
 * How far the map has loaded, 0..1: the loaded pages over the total pages of the tile groups (terrain and buildings;
 * the animations are not waited for, so they do not count); 0 while none has reported; 1 only once the main app says
 * the tiles are loaded. Until then it stays below 1. Both totals are reported up front (see `useIntroTilesSignal`),
 * so the denominator is the whole map from the start and the fraction only grows.
 */
export function mapLoadFraction(load = introLoad, tilesLoaded = introSignal.tilesLoaded) {
    if (tilesLoaded)
        return 1;
    let loaded = 0;
    let total = 0;
    for (const group of ['terrain', 'buildings']) {
        const count = load[group];
        if (!count)
            continue;
        loaded += count.loaded;
        total += count.total;
    }
    return total > 0 ? Math.min(MAX_UNLOADED, loaded / total) : 0;
}

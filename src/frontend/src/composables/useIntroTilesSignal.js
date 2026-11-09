import { watch } from 'vue';
import { atlasPageCount } from '../lib/map/atlasManifests';
import { reportIntroLoad } from '../intro/introLoad';
import { markIntroTilesLoaded } from '../intro/introSignal';
/**
 * Tells the landing intro the map tiles are in, so it can run its exit. That is the case once the view's load
 * settled and either it failed, no canvas will render (join blocked, no plot available: the intro would hold
 * forever), or the canvas finished loading its tile atlases. Shared by LandingView and MapView.
 */
export function useIntroTilesSignal({ settled, error, canvasShown, loadState, animLoad, }) {
    // Feeds the intro timeline's per-group page counts. The totals are known from the atlas manifests' file names, so
    // they are reported up front: the timeline's denominator is the whole map from the start. A phase that has moved
    // on counts as fully loaded.
    const totals = {
        terrain: atlasPageCount('terrain'),
        buildings: atlasPageCount('buildings-level1') + atlasPageCount('buildings-static'),
    };
    reportIntroLoad('terrain', { loaded: 0, total: totals.terrain });
    reportIntroLoad('buildings', { loaded: 0, total: totals.buildings });
    watch(() => loadState.value, (state) => {
        if (!state)
            return;
        if (state.phase === 'terrain' || state.phase === 'buildings') {
            if (state.pages)
                reportIntroLoad(state.phase, state.pages);
            if (state.phase === 'buildings')
                reportIntroLoad('terrain', { loaded: totals.terrain, total: totals.terrain });
        }
        else {
            reportIntroLoad('terrain', { loaded: totals.terrain, total: totals.terrain });
            reportIntroLoad('buildings', { loaded: totals.buildings, total: totals.buildings });
        }
    }, { immediate: true });
    watch(() => animLoad.value, (pages) => {
        if (pages)
            reportIntroLoad('animations', pages);
    }, { immediate: true });
    watch(() => settled.value && (!!error.value || !canvasShown.value || loadState.value?.phase === 'ready'), (tilesLoaded) => {
        if (tilesLoaded)
            markIntroTilesLoaded();
    }, { immediate: true });
}

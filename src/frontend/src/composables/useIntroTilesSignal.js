import { watch } from 'vue';
import { markIntroTilesLoaded } from '../intro/introSignal';
/**
 * Tells the landing intro the map tiles are in, so it can run its exit. That is the case once the view's load
 * settled and either it failed, no canvas will render (join blocked, no plot available: the intro would hold
 * forever), or the canvas finished loading its tile atlases. Shared by LandingView and MapView.
 */
export function useIntroTilesSignal({ settled, error, canvasShown, loadState }) {
    watch(() => settled.value && (!!error.value || !canvasShown.value || loadState.value?.phase === 'ready'), (tilesLoaded) => {
        if (tilesLoaded)
            markIntroTilesLoaded();
    }, { immediate: true });
}

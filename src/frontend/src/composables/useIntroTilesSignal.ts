import { watch, type Ref } from 'vue';
import { markIntroTilesLoaded } from '../intro/introSignal';
import type { MapLoadState } from '../lib/map/HexMapRenderer';

interface IntroTilesSignalSources {
  /** The view's load flow finished (success or error). */
  settled: Readonly<Ref<boolean>>;
  /** The load error shown to the player, if any. */
  error: Readonly<Ref<unknown>>;
  /** Whether the view renders a map canvas at all. */
  canvasShown: Readonly<Ref<boolean>>;
  /** The canvas' tile-art loading state (terrain + building atlases), when it is mounted. */
  loadState: Readonly<Ref<MapLoadState | undefined>>;
}

/**
 * Tells the landing intro the map tiles are in, so it can run its exit. That is the case once the view's load
 * settled and either it failed, no canvas will render (join blocked, no plot available: the intro would hold
 * forever), or the canvas finished loading its tile atlases. Shared by LandingView and MapView.
 */
export function useIntroTilesSignal({ settled, error, canvasShown, loadState }: IntroTilesSignalSources): void {
  watch(
    () => settled.value && (!!error.value || !canvasShown.value || loadState.value?.phase === 'ready'),
    (tilesLoaded) => {
      if (tilesLoaded) markIntroTilesLoaded();
    },
    { immediate: true },
  );
}

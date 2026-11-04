import { reactive } from 'vue';

/** Written by the main app once the map tiles are loaded; read by the intro host. */
export const introSignal = reactive({ tilesLoaded: false });

export function markIntroTilesLoaded(): void {
  if (!introSignal.tilesLoaded) introSignal.tilesLoaded = true;
}

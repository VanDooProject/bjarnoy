import { reactive, ref } from 'vue';

/** Written by the main app once the map tiles are loaded; read by the intro host. */
export const introSignal = reactive({ tilesLoaded: false });

export function markIntroTilesLoaded(): void {
  if (!introSignal.tilesLoaded) introSignal.tilesLoaded = true;
}

/** Whether the landing intro is mounted (it lives on its own app root, so the main app reads this to know). */
export const introMounted = ref(false);

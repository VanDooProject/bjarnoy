import { reactive, ref } from 'vue';

/**
 * Written by the main app once the map tiles are loaded (read by the intro host); `loginRequested` goes the other
 * way: the intro's "Log in" button sets it and the main app routes to /login.
 */
export const introSignal = reactive({ tilesLoaded: false, loginRequested: false });

export function markIntroTilesLoaded(): void {
  if (!introSignal.tilesLoaded) introSignal.tilesLoaded = true;
}

/** Whether the landing intro is mounted (it lives on its own app root, so the main app reads this to know). */
export const introMounted = ref(false);

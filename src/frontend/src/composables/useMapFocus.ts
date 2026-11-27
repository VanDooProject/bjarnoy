import { ref } from 'vue';
import type { AxialCoord } from '../lib/hex/coords';

/**
 * "Show this hex on the map": a request any view can raise (a report's location link) and the map view (MapView.vue) fulfils
 * by centring its camera on the hex. It keeps the map's current mode and zoom, only the camera position changes. One shared
 * ref, so the request also survives the map mounting after it was raised (a direct load of a report); the map clears it
 * once handled. `seq` makes asking for the same hex twice two requests.
 */
export interface MapFocusRequest {
  coord: AxialCoord;
  seq: number;
}

const pending = ref<MapFocusRequest | null>(null);
let seq = 0;

export function useMapFocus() {
  return {
    pending,
    request(coord: AxialCoord) {
      pending.value = { coord, seq: ++seq };
    },
    clear() {
      pending.value = null;
    },
  };
}

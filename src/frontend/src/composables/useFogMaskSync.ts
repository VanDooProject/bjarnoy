import { watch } from 'vue';
import type { HexMapRenderer } from '../lib/map/HexMapRenderer';
import { useWorldStore } from '../stores/world';

/**
 * Fog v2 (map-fog-v2.md §3): pushes the store's freshly fetched fog mask (the chunk window) and the whole-world overview
 * into the renderer. Both are watched together with the renderer, since the renderer may not exist yet on the tick a
 * fetch resolves — and without the push, founding a settlement (world.startHudSync()) would leave the fog quads on
 * their opaque "fully unknown" placeholder forever, since nothing else hands a freshly built/fetched mask to the
 * renderer once the fog is active. Shared by every view that hosts a map canvas.
 */
export function useFogMaskSync(getRenderer: () => HexMapRenderer | null | undefined): void {
  const world = useWorldStore();

  watch(
    [getRenderer, () => world.fogMaskBitmap, () => world.fogMaskBounds, () => world.fogCoverage],
    ([renderer, bitmap, bounds, coverage]) => {
      if (renderer && bitmap && bounds && coverage) renderer.setFogMask(bounds, bitmap, coverage);
    },
  );

  watch(
    [getRenderer, () => world.fogOverviewBitmap, () => world.fogOverviewBounds],
    ([renderer, bitmap, bounds]) => {
      if (renderer && bitmap && bounds) renderer.setFogOverview(bounds, bitmap);
    },
  );
}

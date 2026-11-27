import { watch } from 'vue';
import type { HexMapRenderer } from '../lib/map/HexMapRenderer';
import { useWorldStore } from '../stores/world';

/**
 * Fog v2 (map-fog-v2.md §3): pushes the store's freshly fetched fog mask (the chunk window), its per-hex coverage and the whole-world
 * overview into the renderer. Both are watched together with the renderer, since the renderer may not exist yet on the tick a
 * fetch resolves — and without the push, founding a settlement (world.startHudSync()) would leave the fog quads on
 * their opaque "fully unknown" placeholder forever, since nothing else hands a freshly built/fetched mask to the
 * renderer once the fog is active. Shared by every view that hosts a map canvas.
 */
export function useFogMaskSync(getRenderer: () => HexMapRenderer | null | undefined): void {
  const world = useWorldStore();

  watch(
    [getRenderer, () => world.fogMaskBitmap, () => world.fogMaskBounds],
    ([renderer, bitmap, bounds]) => {
      if (renderer && bitmap && bounds) renderer.setFogMask(bounds, bitmap);
    },
  );

  // Coverage is watched on its own: the overview arriving rebuilds it without a new window texture, and must not
  // re-upload the mask or restart its cross-fade.
  watch(
    [getRenderer, () => world.fogCoverage],
    ([renderer, coverage]) => {
      if (renderer && coverage) renderer.setFogCoverage(coverage);
    },
  );

  watch(
    [getRenderer, () => world.fogOverviewBitmap, () => world.fogOverviewBounds],
    ([renderer, bitmap, bounds]) => {
      if (!renderer) return;
      if (bitmap && bounds) renderer.setFogOverview(bounds, bitmap);
      else if (!bitmap) renderer.clearFogOverview();
    },
  );
}

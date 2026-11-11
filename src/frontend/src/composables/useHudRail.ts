import { ref } from 'vue';
import { DOCK_GUTTER } from '../lib/hud/hudPanelDock';

// The icon rail (components/hud/HudPanelColumn.vue) and the dock (components/hud/HudPanelDock.vue) share two numbers: the
// rail's height, which the rail measures, and the x the rail sits at, which the dock works out from its left columns.
// Module-level on purpose: one rail and one dock exist at a time, and a plain ref beats a store for layout numbers.
export const railHeight = ref(0);
export const railLeft = ref(DOCK_GUTTER);

export function useHudRail() {
  return { railHeight, railLeft };
}

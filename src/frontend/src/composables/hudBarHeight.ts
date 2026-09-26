import { ref } from 'vue';

// The mobile HUD bar's real, current height in px — 64 while collapsed, but
// taller once the drawer is open and ResourceBar switches to its expanded
// (desktop-style stacked) rendering, see ResourceBar.vue's `isExpanded`.
// A shared singleton like composables/hudDrawerOpenState.ts's
// isHudDrawerOpen: TopBar.vue measures and writes it (via ResizeObserver);
// MapView.vue and ArmyPanel.vue's --hud-inset-bottom read it so their own
// layout stays clear of the bar regardless of its current height, instead
// of assuming a fixed 64px. Desktop's bar never actually changes height, so
// this is a no-op there in practice.
export const DEFAULT_HUD_BAR_HEIGHT = 64;
export const hudBarHeightPx = ref(DEFAULT_HUD_BAR_HEIGHT);

import { defineStore } from 'pinia';

// Mobile-only HUD bar docking preference (see components/hud/TopBar.vue,
// components/settings/HudPreferences.vue). Deliberately persisted even in
// DEMO_MODE, unlike most of stores/player.ts's world-coupled state: this is
// a device display preference with nothing to restore against, and a
// debug/UX-research flag that forgets itself on every reload is useless.
const STORAGE_KEY = 'bjarnoy.hudBarPosition';

export type HudBarPosition = 'top' | 'bottom';

function readBarPosition(): HudBarPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'top' || raw === 'bottom' ? raw : 'top';
  } catch {
    // Private browsing / storage disabled / quota — fall back silently.
    return 'top';
  }
}

export const useHudPrefsStore = defineStore('hudPrefs', {
  state: () => ({
    barPosition: readBarPosition() as HudBarPosition,
  }),
  actions: {
    setBarPosition(position: HudBarPosition) {
      this.barPosition = position;
      try {
        localStorage.setItem(STORAGE_KEY, position);
      } catch {
        // Best-effort persistence only — the in-memory value still applies.
      }
    },
  },
});

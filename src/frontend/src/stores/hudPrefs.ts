import { defineStore } from 'pinia';
import {
  DEFAULT_HUD_PANELS,
  HUD_PANEL_IDS,
  applyDrop,
  isHudPanelPref,
  type DropTarget,
  type HudPanelId,
  type HudPanelPref,
} from '../lib/hud/hudPanelDock';

// Mobile-only HUD bar docking preference (see components/hud/TopBar.vue,
// components/settings/HudPreferences.vue). Deliberately persisted even in
// DEMO_MODE, unlike most of stores/player.ts's world-coupled state: this is
// a device display preference with nothing to restore against, and a
// debug/UX-research flag that forgets itself on every reload is useless.
const STORAGE_KEY = 'bjarnoy.hudBarPosition';

const BUILDING_INFO_KEY = 'bjarnoy.hudBuildingInfo';

function readBuildingInfo(): boolean {
  try {
    return localStorage.getItem(BUILDING_INFO_KEY) !== 'off';
  } catch {
    return true;
  }
}

const PANELS_KEY = 'bjarnoy.hudPanels';

type HudPanels = Record<HudPanelId, HudPanelPref>;

/** The desktop panels' prefs, each validated on its own: a bad, missing or old-format entry falls back to its default. */
function readPanels(): HudPanels {
  const panels = {} as HudPanels;
  let stored: unknown = null;
  try {
    const raw = localStorage.getItem(PANELS_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    // Storage disabled or corrupt JSON: every panel keeps its default.
  }
  const record = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  for (const id of HUD_PANEL_IDS) {
    const entry = record[id];
    panels[id] = isHudPanelPref(entry) ? { ...entry } : { ...DEFAULT_HUD_PANELS[id] };
  }
  return panels;
}

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
    // The per-building info markers over the settlement map (components/hud/BuildingHudLayer.vue); on by default.
    buildingInfo: readBuildingInfo(),
    // The desktop settlement view's dockable panels (components/hud/HudPanelDock.vue): open or closed, collapsed to the header, and where they dock.
    panels: readPanels() as HudPanels,
  }),
  actions: {
    toggleBuildingInfo() {
      this.setBuildingInfo(!this.buildingInfo);
    },
    togglePanel(id: HudPanelId) {
      this.panels[id].open = !this.panels[id].open;
      this.savePanels();
    },
    toggleCollapsed(id: HudPanelId) {
      this.panels[id].collapsed = !this.panels[id].collapsed;
      this.savePanels();
    },
    movePanel(id: HudPanelId, target: DropTarget) {
      this.panels = applyDrop(this.panels, id, target);
      this.savePanels();
    },
    savePanels() {
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(this.panels));
      } catch {
        // Best-effort persistence only — the in-memory value still applies.
      }
    },
    setBuildingInfo(on: boolean) {
      this.buildingInfo = on;
      try {
        localStorage.setItem(BUILDING_INFO_KEY, on ? 'on' : 'off');
      } catch {
        // Best-effort persistence only — the in-memory value still applies.
      }
    },
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

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

/** What the building HUD shows: dials and their boxes, the dials alone (a box only on the hovered marker), or nothing. */
export type BuildingHudMode = 'full' | 'levels' | 'off';

/** H and the HUD button step through the modes in this order, then start over. */
export const BUILDING_HUD_CYCLE: Record<BuildingHudMode, BuildingHudMode> = { full: 'levels', levels: 'off', off: 'full' };

function readBuildingHudMode(): BuildingHudMode {
  try {
    const raw = localStorage.getItem(BUILDING_INFO_KEY);
    // Off until the player switches it on (the old "on" value counts as the full HUD).
    return raw === 'full' || raw === 'on' ? 'full' : raw === 'levels' ? 'levels' : 'off';
  } catch {
    return 'off';
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
    // The per-building info markers over the settlement map (components/hud/BuildingHudLayer.vue); full by default.
    buildingHudMode: readBuildingHudMode(),
    // The desktop settlement view's dockable panels (components/hud/HudPanelDock.vue): open or closed, collapsed to the header, and where they dock.
    panels: readPanels() as HudPanels,
  }),
  getters: {
    /** Any building marker shows (full or levels only). */
    buildingInfo: (state): boolean => state.buildingHudMode !== 'off',
  },
  actions: {
    /** H and the HUD button: full → levels only → off → full. */
    cycleBuildingHud() {
      this.setBuildingHudMode(BUILDING_HUD_CYCLE[this.buildingHudMode]);
    },
    togglePanel(id: HudPanelId) {
      this.panels[id].open = !this.panels[id].open;
      this.savePanels();
    },
    /** Opens a panel and expands it if it was collapsed to its header (e.g. a tap on an army's marker brings up the Armies panel). */
    showPanel(id: HudPanelId) {
      const pref = this.panels[id];
      if (pref.open && !pref.collapsed) return;
      pref.open = true;
      pref.collapsed = false;
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
    setBuildingHudMode(mode: BuildingHudMode) {
      this.buildingHudMode = mode;
      try {
        localStorage.setItem(BUILDING_INFO_KEY, mode);
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

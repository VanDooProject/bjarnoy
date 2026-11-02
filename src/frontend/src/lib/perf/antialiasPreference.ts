// The map canvas's antialiasing (MSAA) as a per-device graphics setting,
// persisted next to the animation setting (animationPreference.ts) and for
// the same reason: it is a property of this device, not of the account.
//
// MSAA smooths the edges of drawn geometry (borders, the hover outline, the
// range overlay, construction dials); tile and building art are sprites whose
// edges come from their textures and look the same either way. What it costs
// is fill: every blended pixel is written once per sample. On a GPU that is
// noise, but on a weak or software renderer it is a large share of the frame -
// measured on a software-rendered 1280x720 settlement view, turning it off
// took the frame without water and fog from 4.6 to 7.3 fps (issue #416).
//
// WebGL fixes antialiasing when the context is created, so a change applies
// the next time the map is mounted, not to the canvas already on screen.
import { reactive } from 'vue';

export type AntialiasSetting = 'on' | 'off';

const STORAGE_KEY = 'bjarnoy.antialias';

function readSetting(): AntialiasSetting {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off' ? 'off' : 'on';
  } catch {
    // Private browsing / storage disabled — keep the default.
    return 'on';
  }
}

function writeSetting(setting: AntialiasSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Best-effort persistence only — the in-memory value still applies for
    // the rest of this page session.
  }
}

const state = reactive({ setting: readSetting() });

export const antialiasPreference = {
  get setting(): AntialiasSetting {
    return state.setting;
  },
  set setting(value: AntialiasSetting) {
    state.setting = value;
    writeSetting(value);
  },
  /** What HexMapRenderer.mount passes to Pixi's `antialias`. */
  get enabled(): boolean {
    return state.setting === 'on';
  },
};

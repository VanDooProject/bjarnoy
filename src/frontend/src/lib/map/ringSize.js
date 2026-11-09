// How big the ring menu is drawn when it has room, as a per-device display preference (persisted like
// antialiasPreference.ts). The ring is designed at `1` (52px bubbles, ~9px labels), which is too small to read
// on a desktop screen: there the base size is RING_DESKTOP_SCALE so labels land at a normal reading size, and
// the player's setting multiplies it. A phone keeps `1` as its base (the ring has little room there anyway);
// the setting applies to both. Where the ring does not fit at this size it still shrinks (`ringRoomFor`).
import { reactive } from 'vue';
export const RING_SIZE_SETTINGS = ['small', 'normal', 'large', 'xlarge'];
export const RING_SIZE_FACTOR = { small: 0.8, normal: 1, large: 1.25, xlarge: 1.5 };
/** Base size of the ring on a desktop screen: bubble labels come out at 11.5-13px instead of 8-9px. */
export const RING_DESKTOP_SCALE = 1.4;
const STORAGE_KEY = 'bjarnoy.ringSize';
function readSetting() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return RING_SIZE_SETTINGS.find((s) => s === raw) ?? 'normal';
    }
    catch {
        // Private browsing / storage disabled — keep the default.
        return 'normal';
    }
}
const state = reactive({ setting: readSetting() });
export const ringSizePreference = {
    get setting() {
        return state.setting;
    },
    set setting(value) {
        state.setting = value;
        try {
            localStorage.setItem(STORAGE_KEY, value);
        }
        catch {
            // Best-effort persistence only — the in-memory value still applies for this page session.
        }
    },
};
/** The size the ring is drawn at when it fits: the screen's base size times the player's setting. */
export function ringMaxScale(compactScreen, setting) {
    return (compactScreen ? 1 : RING_DESKTOP_SCALE) * RING_SIZE_FACTOR[setting];
}

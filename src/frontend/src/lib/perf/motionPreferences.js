// Per-device motion settings beyond the map's building clip art
// (animationPreference.ts): water, lake wind, fog and HUD motion. Each is
// 'auto' | 'on' | 'off'; 'auto' follows the device's own "reduce motion"
// setting (animationPreference.reducedMotion, a live OS media query), an
// explicit 'on'/'off' wins over it. Reactive singleton in the same style
// as animationPreference.ts, for the same reasons.
//
// It also owns the one-time landing prompt state: a player whose device asks
// for reduced motion is offered to turn everything on once.
import { reactive } from 'vue';
import { animationPreference } from './animationPreference';
const KEYS = {
    water: 'bjarnoy.motion.water',
    lakes: 'bjarnoy.motion.lakes',
    fog: 'bjarnoy.motion.fog',
    hud: 'bjarnoy.motion.hud',
};
export const MOTION_PROMPT_KEY = 'bjarnoy.motionPrompt';
function readStored(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        // Private browsing / storage disabled — fall back to the defaults.
        return null;
    }
}
function writeStored(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch {
        // Best-effort persistence only — the in-memory value still applies.
    }
}
function readSetting(key) {
    const raw = readStored(KEYS[key]);
    return raw === 'auto' || raw === 'on' || raw === 'off' ? raw : 'auto';
}
function readPrompt() {
    const raw = readStored(MOTION_PROMPT_KEY);
    return raw === 'on' || raw === 'dismissed' ? raw : null;
}
/** Whether motion plays: an explicit choice wins, 'auto' plays unless the device asks for reduced motion. */
export function resolveMotion(setting, reducedMotion) {
    if (setting === 'on')
        return true;
    if (setting === 'off')
        return false;
    return !reducedMotion;
}
const state = reactive({
    water: readSetting('water'),
    lakes: readSetting('lakes'),
    fog: readSetting('fog'),
    hud: readSetting('hud'),
    prompt: readPrompt(),
});
function setMotion(key, value) {
    state[key] = value;
    writeStored(KEYS[key], value);
}
export const motionPreferences = {
    get water() {
        return state.water;
    },
    set water(value) {
        setMotion('water', value);
    },
    get lakes() {
        return state.lakes;
    },
    set lakes(value) {
        setMotion('lakes', value);
    },
    get fog() {
        return state.fog;
    },
    set fog(value) {
        setMotion('fog', value);
    },
    get hud() {
        return state.hud;
    },
    set hud(value) {
        setMotion('hud', value);
    },
    get waterEnabled() {
        return resolveMotion(state.water, animationPreference.reducedMotion);
    },
    /** The wind gust crossing the bog lakes; hidden (not frozen) when off. */
    get lakesEnabled() {
        return resolveMotion(state.lakes, animationPreference.reducedMotion);
    },
    get fogEnabled() {
        return resolveMotion(state.fog, animationPreference.reducedMotion);
    },
    get hudEnabled() {
        return resolveMotion(state.hud, animationPreference.reducedMotion);
    },
    get promptAnswer() {
        return state.prompt;
    },
    /** Landing prompt: device asks for less motion, nothing answered yet, and every setting still untouched. */
    get promptVisible() {
        return (animationPreference.reducedMotion &&
            state.prompt === null &&
            animationPreference.setting === 'auto' &&
            state.water === 'auto' &&
            state.lakes === 'auto' &&
            state.fog === 'auto' &&
            state.hud === 'auto');
    },
    /** "Turn on": every animation setting to 'on' (buildings, water, lake wind, fog, HUD) and the prompt answered. */
    turnAllOn() {
        animationPreference.setting = 'on';
        setMotion('water', 'on');
        setMotion('lakes', 'on');
        setMotion('fog', 'on');
        setMotion('hud', 'on');
        state.prompt = 'on';
        writeStored(MOTION_PROMPT_KEY, 'on');
    },
    /** "Keep reduced" / ×: settings stay on auto, the prompt never shows again. */
    dismissPrompt() {
        state.prompt = 'dismissed';
        writeStored(MOTION_PROMPT_KEY, 'dismissed');
    },
};

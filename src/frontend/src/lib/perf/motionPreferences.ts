// Per-device motion settings beyond the map's building clip art
// (animationPreference.ts): water, fog and HUD motion. Each is
// 'auto' | 'on' | 'off'; 'auto' follows the device's own "reduce motion"
// setting (animationPreference.reducedMotion, a live OS media query), an
// explicit 'on'/'off' wins over it. Reactive singleton in the same style
// as animationPreference.ts, for the same reasons.
//
// It also owns the one-time landing prompt state: a player whose device asks
// for reduced motion is offered to turn everything on once.
import { reactive } from 'vue';
import { animationPreference, type AnimationSetting } from './animationPreference';

export type MotionSetting = AnimationSetting;
export type MotionKey = 'water' | 'fog' | 'hud';
export type MotionPromptAnswer = 'on' | 'dismissed';

const KEYS: Record<MotionKey, string> = {
  water: 'bjarnoy.motion.water',
  fog: 'bjarnoy.motion.fog',
  hud: 'bjarnoy.motion.hud',
};
export const MOTION_PROMPT_KEY = 'bjarnoy.motionPrompt';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing / storage disabled — fall back to the defaults.
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence only — the in-memory value still applies.
  }
}

function readSetting(key: MotionKey): MotionSetting {
  const raw = readStored(KEYS[key]);
  return raw === 'auto' || raw === 'on' || raw === 'off' ? raw : 'auto';
}

function readPrompt(): MotionPromptAnswer | null {
  const raw = readStored(MOTION_PROMPT_KEY);
  return raw === 'on' || raw === 'dismissed' ? raw : null;
}

/** Whether motion plays: an explicit choice wins, 'auto' plays unless the device asks for reduced motion. */
export function resolveMotion(setting: MotionSetting, reducedMotion: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !reducedMotion;
}

const state = reactive({
  water: readSetting('water'),
  fog: readSetting('fog'),
  hud: readSetting('hud'),
  prompt: readPrompt() as MotionPromptAnswer | null,
});

function setMotion(key: MotionKey, value: MotionSetting): void {
  state[key] = value;
  writeStored(KEYS[key], value);
}

export const motionPreferences = {
  get water(): MotionSetting {
    return state.water;
  },
  set water(value: MotionSetting) {
    setMotion('water', value);
  },
  get fog(): MotionSetting {
    return state.fog;
  },
  set fog(value: MotionSetting) {
    setMotion('fog', value);
  },
  get hud(): MotionSetting {
    return state.hud;
  },
  set hud(value: MotionSetting) {
    setMotion('hud', value);
  },
  get waterEnabled(): boolean {
    return resolveMotion(state.water, animationPreference.reducedMotion);
  },
  get fogEnabled(): boolean {
    return resolveMotion(state.fog, animationPreference.reducedMotion);
  },
  get hudEnabled(): boolean {
    return resolveMotion(state.hud, animationPreference.reducedMotion);
  },
  get promptAnswer(): MotionPromptAnswer | null {
    return state.prompt;
  },
  /** Landing prompt: device asks for less motion, nothing answered yet, and every setting still untouched. */
  get promptVisible(): boolean {
    return (
      animationPreference.reducedMotion &&
      state.prompt === null &&
      animationPreference.setting === 'auto' &&
      state.water === 'auto' &&
      state.fog === 'auto' &&
      state.hud === 'auto'
    );
  },
  /** "Turn on": every animation setting to 'on' (buildings, water, fog, HUD) and the prompt answered. */
  turnAllOn(): void {
    animationPreference.setting = 'on';
    setMotion('water', 'on');
    setMotion('fog', 'on');
    setMotion('hud', 'on');
    state.prompt = 'on';
    writeStored(MOTION_PROMPT_KEY, 'on');
  },
  /** "Keep reduced" / ×: settings stay on auto, the prompt never shows again. */
  dismissPrompt(): void {
    state.prompt = 'dismissed';
    writeStored(MOTION_PROMPT_KEY, 'dismissed');
  },
};

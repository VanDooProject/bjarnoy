// The map canvas's render resolution (device pixels per CSS pixel) as a
// per-device graphics setting. Same shape as animationPreference.ts: a
// reactive module singleton persisted in localStorage. 'auto' lets the shared
// fps governor (fpsGovernor.ts) pick a level, starting at the lowest and
// stepping up only while the frame rate holds; an explicit value is used as
// is, clamped to what this screen offers.
import { reactive } from 'vue';
import { FpsGovernor, type GovernorProgress } from './fpsGovernor';

/** 'auto' or the resolution as a number string ('1', '1.5', '2', or a fractional top level such as '1.75'). */
export type ResolutionSetting = 'auto' | `${number}`;

export type ResolutionReason = 'forced' | 'device-max' | 'measuring' | 'auto-max' | 'auto-down';

const STORAGE_KEY = 'bjarnoy.resolution';

/** Never render above 2x: the cost grows with the square, the sharpness gain does not. */
const MAX_RESOLUTION = 2;
const STEPS = [1, 1.5, 2];

/** The resolutions a screen with this device pixel ratio can use, ascending. */
export function resolutionLevels(dpr: number): number[] {
  const cap = Math.min(dpr || 1, MAX_RESOLUTION);
  if (cap < 1) return [cap];
  const levels = STEPS.filter((level) => level <= cap);
  if (cap > levels[levels.length - 1]) levels.push(cap);
  return levels;
}

/** The highest level that is <= `value` (the lowest level when `value` is below all of them). */
export function clampToLevel(levels: readonly number[], value: number): number {
  let result = levels[0];
  for (const level of levels) if (level <= value) result = level;
  return result;
}

function readSetting(): ResolutionSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'auto') return 'auto';
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) > 0) return raw as ResolutionSetting;
    return 'auto';
  } catch {
    // Private browsing / storage disabled — fall back to the safe default.
    return 'auto';
  }
}

function writeSetting(setting: ResolutionSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Best-effort persistence only — the in-memory value still applies for
    // the rest of this page session.
  }
}

/** Computed once at module load; a monitor change is not followed. */
const levels = resolutionLevels(typeof window === 'undefined' ? 1 : window.devicePixelRatio);

/** The Auto governor: level i is `levels[i]`. Fed by `frameGovernors.ts`. */
export const resolutionGovernor = new FpsGovernor(levels.length);

const state = reactive({
  setting: readSetting(),
  governorLevel: resolutionGovernor.getLevel(),
  canClimbNormally: resolutionGovernor.canClimbNormally(),
  progress: resolutionGovernor.getProgress(),
});

/** Copies the governor's state into the reactive state; the progress object is replaced only when it changed (once per 1s bucket at most). */
export function refreshResolutionState(): void {
  state.governorLevel = resolutionGovernor.getLevel();
  state.canClimbNormally = resolutionGovernor.canClimbNormally();
  const next: GovernorProgress = resolutionGovernor.getProgress();
  const prev = state.progress;
  if (next.fps !== prev.fps || next.goodMs !== prev.goodMs || next.window !== prev.window) state.progress = next;
}

export const resolutionPreference = {
  get setting(): ResolutionSetting {
    return state.setting;
  },
  set setting(value: ResolutionSetting) {
    state.setting = value;
    writeSetting(value);
  },
  get levels(): readonly number[] {
    return levels;
  },
  get effective(): number {
    if (state.setting !== 'auto') return clampToLevel(levels, Number(state.setting));
    return levels[state.governorLevel];
  },
  get reason(): ResolutionReason {
    if (state.setting !== 'auto') return 'forced';
    if (levels.length === 1) return 'device-max';
    if (state.governorLevel === levels.length - 1) return 'auto-max';
    return state.canClimbNormally ? 'measuring' : 'auto-down';
  },
  get progress(): GovernorProgress {
    return state.progress;
  },
};

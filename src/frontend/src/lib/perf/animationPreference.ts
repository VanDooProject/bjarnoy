// Whether the settlement map plays `buildings-anim` clip art at all — see
// docs/design (perf) on the `buildings-anim`/`wasted-buildings-anim-*`
// atlas cost (~319 MB decoded) and why every clip also has a static frame
// in the static/terrain atlases, so the map renders correctly with
// animation off entirely (`topAnimFor` returns undefined, the static
// texture is used — see HexMapRenderer.syncTopAnim).
//
// Unlike most of this codebase's `lib/` layer (see `water/waterDebug.ts`'s
// own comment on staying Vue-free so a Vue wrapper is the component's own
// choice), this module deliberately *is* Vue-reactive: it is a genuine
// cross-app singleton — read by ProfileView's settings UI, written by a
// radio group there, and read by whatever wires HexMapRenderer up to it —
// and a plain mutable object would need every one of those call sites to
// invent its own `reactive()` wrapper around the same module-level state,
// which only works once per module in the first place (two wrappers around
// the same plain object are two different reactive proxies that don't see
// each other's writes). One reactive source of truth here avoids that.
//
// Pinia is not used: this is a per-device display preference with nothing
// to restore against (see stores/hudPrefs.ts's own reasoning for its very
// similar `bjarnoy.hudBarPosition` key) rather than app/session state, and
// it needs no store-wide devtools/persistence-plugin machinery Pinia adds.
import { reactive } from 'vue';
import { FpsGovernor, type GovernorProgress } from './fpsGovernor';

/** The user's own choice, persisted per device. 'auto' hands the decision to environment checks + the FPS governor below. */
export type AnimationSetting = 'auto' | 'on' | 'off';

/** Why animations are (or aren't) playing right now, for a status line in the UI. */
export type AnimationReason =
  | 'forced-on'
  | 'forced-off'
  | 'reduced-motion'
  | 'save-data'
  | 'measuring'
  | 'auto-on'
  | 'auto-off-slow';

const STORAGE_KEY = 'bjarnoy.animations';

function readSetting(): AnimationSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'auto' || raw === 'on' || raw === 'off' ? raw : 'auto';
  } catch {
    // Private browsing / storage disabled — fall back to the safe default.
    return 'auto';
  }
}

function writeSetting(setting: AnimationSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Best-effort persistence only — the in-memory value still applies for
    // the rest of this page session.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** `navigator.connection` is a non-standard, Chromium-only API — absent everywhere else, hence the optional chaining rather than a feature-detected branch. */
function saveDataEnabled(): boolean {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: { saveData?: boolean } });
  return nav?.connection?.saveData === true;
}

/**
 * The animation governor's state for the settings line and
 * `resolveAnimationState`: `measuring` (level 0, never dropped: animations
 * off while the device is measured without their cost), `on` (level 1),
 * `off-slow` (level 0 after a drop: off, one retry through the stricter
 * 30 s at 60 fps window, a second drop latches it off for the session).
 */
export type GovernorState = 'measuring' | 'on' | 'off-slow';

export type { GovernorProgress };

export interface AnimationResolution {
  effective: boolean;
  reason: AnimationReason;
}

/**
 * The resolution table §2's brief specifies, pulled out as a pure function
 * so it's testable without the reactive singleton/governor/DOM around it.
 * The per-device setting always wins over the environment checks when it's
 * an explicit choice ('on'/'off') — a user who explicitly asked for
 * animations on gets them even under reduced-motion/save-data, since that's
 * an override they made on purpose.
 */
export function resolveAnimationState(
  setting: AnimationSetting,
  env: { reducedMotion: boolean; saveData: boolean },
  governorState: GovernorState,
): AnimationResolution {
  if (setting === 'off') return { effective: false, reason: 'forced-off' };
  if (setting === 'on') return { effective: true, reason: 'forced-on' };
  if (env.reducedMotion) return { effective: false, reason: 'reduced-motion' };
  if (env.saveData) return { effective: false, reason: 'save-data' };
  if (governorState === 'on') return { effective: true, reason: 'auto-on' };
  if (governorState === 'off-slow') return { effective: false, reason: 'auto-off-slow' };
  return { effective: false, reason: 'measuring' };
}

/** Level 0 is off, level 1 is on. Fed by `frameGovernors.ts`, the renderer's single entry point. */
export const animationGovernor = new FpsGovernor(2);

function governorStateOf(g: FpsGovernor): GovernorState {
  if (g.getLevel() === 1) return 'on';
  return g.failures(1) > 0 ? 'off-slow' : 'measuring';
}

const state = reactive({
  setting: readSetting(),
  reducedMotion: prefersReducedMotion(),
  saveData: saveDataEnabled(),
  governorState: governorStateOf(animationGovernor),
  progress: animationGovernor.getProgress(),
});

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    state.reducedMotion = mq.matches;
  };
  // Safari < 14 only has the deprecated addListener/removeListener pair.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else if (typeof (mq as unknown as { addListener?: (cb: () => void) => void }).addListener === 'function') {
    (mq as unknown as { addListener: (cb: () => void) => void }).addListener(onChange);
  }
}

/** Copies the governor's state into the reactive state; the progress object is replaced only when it changed (once per 1s bucket at most). */
export function refreshAnimationState(): void {
  state.governorState = governorStateOf(animationGovernor);
  const next = animationGovernor.getProgress();
  const prev = state.progress;
  if (next.fps !== prev.fps || next.goodMs !== prev.goodMs || next.window !== prev.window) state.progress = next;
}

/**
 * The reactive singleton other modules import. `setting`/`effective`/
 * `reason` are plain getters (and `setting` a setter) over the module-level
 * `reactive()` state above, which is what makes them track correctly inside
 * a Vue `computed`/`watch`/template even though this object itself is never
 * wrapped in `reactive()` — Vue records the dependency at the point a
 * reactive proxy's own property is read, which happens inside these
 * getters regardless of what object they're hung off.
 */
export const animationPreference = {
  get setting(): AnimationSetting {
    return state.setting;
  },
  set setting(value: AnimationSetting) {
    state.setting = value;
    writeSetting(value);
  },
  get reducedMotion(): boolean {
    return state.reducedMotion;
  },
  get saveData(): boolean {
    return state.saveData;
  },
  get governorState(): GovernorState {
    return state.governorState;
  },
  get progress(): GovernorProgress {
    return state.progress;
  },
  // Reads through this object's own getters (`this.reducedMotion`, not
  // `state.reducedMotion` directly) so a test can override one of them with
  // `Object.defineProperty` on `animationPreference` itself — e.g. to check
  // the profile UI's reduced-motion status line — without this module
  // exporting its private `state` just to make that possible.
  get resolution(): AnimationResolution {
    return resolveAnimationState(this.setting, { reducedMotion: this.reducedMotion, saveData: this.saveData }, this.governorState);
  },
  get effective(): boolean {
    return this.resolution.effective;
  },
  get reason(): AnimationReason {
    return this.resolution.reason;
  },
  /**
   * Building clip art outside the settlement map (the docs pages' camps and
   * giants): the same resolution as `effective`, minus the map's fps
   * governor, which only measures the map's own renderer — 'auto' plays
   * unless the device asks for reduced motion or saves data.
   */
  get clipsEnabled(): boolean {
    return resolveAnimationState(this.setting, { reducedMotion: this.reducedMotion, saveData: this.saveData }, 'on').effective;
  },
  /**
   * An Auto drop keeps the animation textures loaded (a retry then costs no
   * decode); Off, reduced motion and save-data release them.
   */
  get keepLoaded(): boolean {
    return this.reason === 'auto-off-slow';
  },
};

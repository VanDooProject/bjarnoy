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

/** `AnimationGovernor`'s own state machine — see its class doc for the transition rules. */
export type GovernorState = 'measuring' | 'on' | 'off-slow';

const ENABLE_FPS_THRESHOLD = 55;
const ENABLE_SUSTAIN_MS = 30_000;
const DISABLE_FPS_THRESHOLD = 30;
const DISABLE_SUSTAIN_MS = 5_000;
/**
 * Buckets fps into ~1s means rather than judging every single frame
 * interval — so one dropped frame (a GC pause, a texture upload) can't
 * reset a 30s enable window or trip the 5s disable one; only a bucket
 * whose *average* fps misses the threshold counts.
 */
const BUCKET_MS = 1000;

/**
 * A pure (no DOM, no timers of its own — every timestamp is passed in) FPS
 * governor for the 'auto' animation setting. Three states:
 *
 * - `measuring`: the starting state, animations off. This is deliberate —
 *   the whole point is to measure the device's fps *without* the cost of
 *   the animations first, so turning them on doesn't invalidate the very
 *   measurement that decided to turn them on.
 * - `on`: fps was >= 55 for a sustained 30s of measuring, animations play.
 * - `off-slow`: once `on`, fps dropped below 30 for a sustained 5s. This
 *   *latches* — it never re-measures back to `on` for the rest of the page
 *   session (a fresh mount/reload starts over). Latching matters because
 *   animations are part of what costs the fps: an un-latched governor would
 *   oscillate (on -> slow -> off -> fast again because nothing is drawing
 *   -> on -> slow again), which is worse than just staying off.
 */
export class AnimationGovernor {
  private state: GovernorState = 'measuring';
  private latched = false;
  private bucketFrames = 0;
  private bucketMs = 0;
  private goodStreakMs = 0;
  private badStreakMs = 0;

  getState(): GovernorState {
    return this.latched ? 'off-slow' : this.state;
  }

  /** Feed one frame's interval. `nowMs` is unused by the bucketing itself (frameMs already carries the interval) but kept in the signature for callers and future use (e.g. detecting a gap larger than frameMs itself, such as a debugger pause). */
  sample(nowMs: number, frameMs: number): void {
    void nowMs;
    if (this.latched) return;
    if (!(frameMs > 0)) return;
    this.bucketFrames += 1;
    this.bucketMs += frameMs;
    if (this.bucketMs < BUCKET_MS) return;

    const fps = (this.bucketFrames * 1000) / this.bucketMs;
    this.bucketFrames = 0;
    this.bucketMs = 0;

    if (this.state === 'measuring') {
      if (fps >= ENABLE_FPS_THRESHOLD) {
        this.goodStreakMs += BUCKET_MS;
        if (this.goodStreakMs >= ENABLE_SUSTAIN_MS) {
          this.state = 'on';
          this.badStreakMs = 0;
        }
      } else {
        this.goodStreakMs = 0;
      }
      return;
    }

    // state === 'on' (off-slow only happens via the latch, handled above)
    if (fps < DISABLE_FPS_THRESHOLD) {
      this.badStreakMs += BUCKET_MS;
      if (this.badStreakMs >= DISABLE_SUSTAIN_MS) {
        this.state = 'off-slow';
        this.latched = true;
      }
    } else {
      this.badStreakMs = 0;
    }
  }

  /**
   * Restarts whichever window is currently running (the 30s enable window
   * if still `measuring`, the 5s disable window if `on`) by dropping the
   * in-progress bucket and streak — used when the tab becomes visible again
   * (the gap while hidden is not a real frame rate) or the map remounts.
   * Deliberately does NOT clear the latch: once a device has been judged
   * too slow this page session, it stays off for the rest of it.
   */
  reset(): void {
    this.bucketFrames = 0;
    this.bucketMs = 0;
    this.goodStreakMs = 0;
    this.badStreakMs = 0;
  }
}

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

const governor = new AnimationGovernor();

const state = reactive({
  setting: readSetting(),
  reducedMotion: prefersReducedMotion(),
  saveData: saveDataEnabled(),
  governorState: governor.getState() as GovernorState,
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

function refreshGovernorState(): void {
  state.governorState = governor.getState();
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
   * The renderer's per-tick entry point (only meaningful while animations
   * are 'auto' and still being measured/governed — forced 'on'/'off' just
   * ignore the governor's state, but feeding it samples regardless is
   * harmless and keeps the measurement warm for if the user switches back
   * to 'auto'). Samples while the tab is hidden are dropped: `onTick`
   * already stops firing then (see HexMapRenderer's ticker pause), but a
   * defensive check here means any other caller doesn't have to remember
   * that rule too.
   */
  feedFrame(nowMs: number, frameMs: number): void {
    if (typeof document !== 'undefined' && document.hidden) return;
    governor.sample(nowMs, frameMs);
    refreshGovernorState();
  },
  /** Call when the tab becomes visible again (or the map remounts) — see `AnimationGovernor.reset`. */
  resetGovernor(): void {
    governor.reset();
    refreshGovernorState();
  },
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) animationPreference.resetGovernor();
  });
}

// The renderer's single per-frame entry point for both fps governors (the
// building-animation setting and the render-resolution setting). It decides
// whether a frame counts at all (frameActivity.ts) and which direction each
// governor may move right now, so the two never judge each other's cost.
//
// Order: animations go first both ways. Resolution only climbs once the
// animation governor has nothing left to climb normally (it is at its top, or
// its next step is latched), and only drops once animations are off.
import { reactive } from 'vue';
import { FrameActivity, readFrameEnv, type BackgroundReason, type FrameMode } from './frameActivity';
import { animationGovernor, animationPreference, refreshAnimationState } from './animationPreference';
import { refreshResolutionState, resolutionGovernor } from './resolutionPreference';

const activity = new FrameActivity();

const activityState = reactive<{ mode: FrameMode; reason: BackgroundReason | null }>({ mode: 'active', reason: null });

/** Whether frames currently count, and if not why: for the settings' measure lines. */
export const frameActivityState = {
  get mode(): FrameMode {
    return activityState.mode;
  },
  get reason(): BackgroundReason | null {
    return activityState.reason;
  },
};

function refreshAll(mode: FrameMode, reason: BackgroundReason | null): void {
  if (activityState.mode !== mode) activityState.mode = mode;
  if (activityState.reason !== reason) activityState.reason = reason;
  refreshAnimationState();
  refreshResolutionState();
}

export function resetGovernors(): void {
  animationGovernor.reset();
  resolutionGovernor.reset();
  refreshAnimationState();
  refreshResolutionState();
}

/** Call once per rendered frame with the frame's interval. */
export function feedFrame(nowMs: number, frameMs: number): void {
  void nowMs;
  const { mode, reason, resumed } = activity.classify(frameMs, readFrameEnv());
  if (resumed) {
    animationGovernor.reset();
    resolutionGovernor.reset();
  }
  if (mode === 'background') {
    refreshAll(mode, reason);
    return;
  }

  const animGoverned =
    animationPreference.setting === 'auto' && !animationPreference.reducedMotion && !animationPreference.saveData;
  const animBefore = animationGovernor.getLevel();
  const resBefore = resolutionGovernor.getLevel();

  animationGovernor.sample(frameMs, { up: true, down: true });

  const animTop = animationGovernor.getLevel() === animationGovernor.getMaxLevel();
  const animNextLatched = animationGovernor.failures(animationGovernor.getLevel() + 1) >= 2;
  resolutionGovernor.sample(frameMs, {
    up: !animGoverned || animTop || animNextLatched,
    down: !animGoverned || animationGovernor.getLevel() === 0,
  });

  // A level change alters the cost of every following frame: the other
  // governor's running window measured different conditions.
  if (animationGovernor.getLevel() !== animBefore) resolutionGovernor.reset();
  if (resolutionGovernor.getLevel() !== resBefore) animationGovernor.reset();

  refreshAll(mode, reason);
}

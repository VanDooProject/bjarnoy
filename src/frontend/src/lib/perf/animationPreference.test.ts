// @vitest-environment jsdom
// The singleton import below touches `document`/`window.matchMedia` at
// module load (its visibilitychange listener + reduced-motion query), which
// the default 'node' test environment doesn't provide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationGovernor, resolveAnimationState } from './animationPreference';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

describe('AnimationGovernor', () => {
  let governor: AnimationGovernor;

  beforeEach(() => {
    governor = new AnimationGovernor();
  });

  // Frame counters below use fps values whose frame interval is an exact
  // binary fraction (100fps -> 10ms, 20fps -> 50ms) rather than e.g. 60fps's
  // repeating 16.666...ms, so summing many frames' intervals never drifts
  // below the 1000ms bucket boundary by float rounding error alone — the
  // governor's own bucketing logic is what's under test here, not floating
  // point addition.
  let clockMs = 0;

  /** Feeds `seconds` worth of frames at a steady `fps`. */
  function feedSteady(fps: number, seconds: number): void {
    const frameMs = 1000 / fps;
    const frames = Math.round(fps * seconds);
    for (let i = 0; i < frames; i++) {
      clockMs += frameMs;
      governor.sample(clockMs, frameMs);
    }
  }

  it('starts in measuring (animations off)', () => {
    expect(governor.getState()).toBe('measuring');
  });

  it('does not enable before 30s of sustained >= 55fps', () => {
    feedSteady(100, 29);
    expect(governor.getState()).toBe('measuring');
  });

  it('enables after 30s of sustained >= 55fps', () => {
    feedSteady(100, 30);
    expect(governor.getState()).toBe('on');
  });

  it('a single hitch within a bucket does not block enabling', () => {
    // 100 frames/sec of 10ms each is a clean 1000ms bucket at fps=100; swap
    // one 10ms frame for a 100ms hitch and the bucket mean (~91.7fps) still
    // clears the 55fps bar, so a single stutter shouldn't reset the streak.
    let now = 0;
    for (let bucket = 0; bucket < 30; bucket++) {
      for (let frame = 0; frame < 100; frame++) {
        const frameMs = bucket === 15 && frame === 0 ? 100 : 10;
        now += frameMs;
        governor.sample(now, frameMs);
      }
    }
    expect(governor.getState()).toBe('on');
  });

  it('a sustained slow bucket resets the enable streak', () => {
    feedSteady(100, 15);
    feedSteady(20, 1);
    feedSteady(100, 15);
    // Only 15s of sustained good fps since the slow bucket, short of 30s.
    expect(governor.getState()).toBe('measuring');
    feedSteady(100, 15);
    expect(governor.getState()).toBe('on');
  });

  it('drops to off-slow and latches after 5s sustained under 30fps once on', () => {
    feedSteady(100, 30);
    expect(governor.getState()).toBe('on');
    feedSteady(20, 5);
    expect(governor.getState()).toBe('off-slow');
  });

  it('reset() does not clear the latch', () => {
    feedSteady(100, 30);
    feedSteady(20, 5);
    expect(governor.getState()).toBe('off-slow');
    governor.reset();
    expect(governor.getState()).toBe('off-slow');
    // Latched: further good samples never bring it back this page session.
    feedSteady(100, 60);
    expect(governor.getState()).toBe('off-slow');
  });

  it('reset() restarts the in-progress measuring window', () => {
    feedSteady(100, 20);
    expect(governor.getState()).toBe('measuring');
    governor.reset();
    feedSteady(100, 20);
    // Only 20s since reset, short of the 30s needed.
    expect(governor.getState()).toBe('measuring');
    feedSteady(100, 10);
    expect(governor.getState()).toBe('on');
  });

  it('ignores non-positive frame intervals', () => {
    governor.sample(0, 0);
    governor.sample(0, -5);
    expect(governor.getState()).toBe('measuring');
  });
});

describe('resolveAnimationState', () => {
  const noEnv = { reducedMotion: false, saveData: false };

  it('off always wins', () => {
    expect(resolveAnimationState('off', { reducedMotion: true, saveData: true }, 'on')).toEqual({
      effective: false,
      reason: 'forced-off',
    });
  });

  it('on overrides reduced-motion and save-data', () => {
    expect(resolveAnimationState('on', { reducedMotion: true, saveData: false }, 'measuring')).toEqual({
      effective: true,
      reason: 'forced-on',
    });
    expect(resolveAnimationState('on', { reducedMotion: false, saveData: true }, 'measuring')).toEqual({
      effective: true,
      reason: 'forced-on',
    });
  });

  it('auto respects reduced-motion over the governor', () => {
    expect(resolveAnimationState('auto', { reducedMotion: true, saveData: false }, 'on')).toEqual({
      effective: false,
      reason: 'reduced-motion',
    });
  });

  it('auto respects save-data over the governor', () => {
    expect(resolveAnimationState('auto', { reducedMotion: false, saveData: true }, 'on')).toEqual({
      effective: false,
      reason: 'save-data',
    });
  });

  it('auto follows the governor once environment checks pass', () => {
    expect(resolveAnimationState('auto', noEnv, 'measuring')).toEqual({ effective: false, reason: 'measuring' });
    expect(resolveAnimationState('auto', noEnv, 'on')).toEqual({ effective: true, reason: 'auto-on' });
    expect(resolveAnimationState('auto', noEnv, 'off-slow')).toEqual({ effective: false, reason: 'auto-off-slow' });
  });
});

describe('animationPreference singleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('defaults to auto when nothing is stored', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
  });

  it('falls back to auto for an unrecognised stored value', async () => {
    const backing = stubLocalStorage();
    backing.set('bjarnoy.animations', 'sideways');
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
  });

  it('persists an explicit setting and reads it back', async () => {
    const backing = stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    animationPreference.setting = 'on';
    expect(animationPreference.setting).toBe('on');
    expect(backing.get('bjarnoy.animations')).toBe('on');
  });

  it('does not throw when localStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {},
    });
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
    expect(() => {
      animationPreference.setting = 'off';
    }).not.toThrow();
    expect(animationPreference.setting).toBe('off');
  });

  it('reports forced-off/forced-on reasons for an explicit setting', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    animationPreference.setting = 'off';
    expect(animationPreference.effective).toBe(false);
    expect(animationPreference.reason).toBe('forced-off');
    animationPreference.setting = 'on';
    expect(animationPreference.effective).toBe(true);
    expect(animationPreference.reason).toBe('forced-on');
  });

  it('starts auto in measuring, off', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
    expect(animationPreference.effective).toBe(false);
    expect(animationPreference.reason).toBe('measuring');
  });

  it('feedFrame is ignored while the document is hidden', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    // 30s at 60fps would normally enable the governor.
    let now = 0;
    for (let i = 0; i < 60 * 30; i++) {
      now += 1000 / 60;
      animationPreference.feedFrame(now, 1000 / 60);
    }
    expect(animationPreference.reason).toBe('measuring');
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
});

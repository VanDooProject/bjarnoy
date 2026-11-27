// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}

async function load() {
  vi.resetModules();
  stubLocalStorage();
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  const governors = await import('./frameGovernors');
  const animation = await import('./animationPreference');
  const resolution = await import('./resolutionPreference');
  return { ...governors, animation, resolution };
}

let hidden = false;
let focused = true;
let clock = 0;

beforeEach(() => {
  hidden = false;
  focused = true;
  clock = 0;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frameGovernors', () => {
  function feeder(feedFrame: (now: number, ms: number) => void) {
    // Intervals alternate +-20% around the mean: a metronomic 20 fps would
    // (correctly) read as a browser frame cap and not count. fps values are
    // even with exact binary intervals (128 -> 7.8125 ms, 20 -> 50 ms).
    return (fps: number, seconds: number) => {
      const mean = 1000 / fps;
      for (let i = 0; i < fps * seconds; i++) {
        const ms = i % 2 === 0 ? mean * 0.8 : mean * 1.2;
        clock += ms;
        feedFrame(clock, ms);
      }
    };
  }

  it('Auto on a fast device: animations first, then resolution 1 -> 1.5 -> 2', async () => {
    const { feedFrame, animation, resolution } = await load();
    const feed = feeder(feedFrame);
    feed(128, 9);
    expect(animation.animationPreference.effective).toBe(false);
    expect(resolution.resolutionPreference.effective).toBe(1);
    feed(128, 1);
    expect(animation.animationPreference.effective).toBe(true);
    expect(resolution.resolutionPreference.effective).toBe(1);
    feed(128, 10);
    expect(resolution.resolutionPreference.effective).toBe(1.5);
    feed(128, 10);
    expect(resolution.resolutionPreference.effective).toBe(2);
    expect(resolution.resolutionPreference.reason).toBe('auto-max');
  });

  it('on a slow-down animations drop first, then resolution steps down', async () => {
    const { feedFrame, animation, resolution } = await load();
    const feed = feeder(feedFrame);
    feed(128, 30);
    expect(resolution.resolutionPreference.effective).toBe(2);
    feed(20, 5);
    expect(animation.animationPreference.effective).toBe(false);
    expect(resolution.resolutionPreference.effective).toBe(2);
    feed(20, 5);
    expect(resolution.resolutionPreference.effective).toBe(1.5);
    feed(20, 5);
    expect(resolution.resolutionPreference.effective).toBe(1);
  });

  it('an unfocused stretch counts nothing and restarts the window', async () => {
    const { feedFrame, animation, frameActivityState } = await load();
    const feed = feeder(feedFrame);
    feed(128, 8);
    focused = false;
    feed(128, 30);
    expect(frameActivityState).toMatchObject({ mode: 'background', reason: 'unfocused' });
    expect(animation.animationPreference.effective).toBe(false);
    focused = true;
    // 1s settling, then a fresh 10s window.
    feed(128, 1);
    feed(128, 9);
    expect(animation.animationPreference.effective).toBe(false);
    feed(128, 2);
    expect(animation.animationPreference.effective).toBe(true);
    expect(frameActivityState.mode).toBe('active');
  });

  it('a hidden stretch counts nothing either', async () => {
    const { feedFrame, animation, frameActivityState } = await load();
    const feed = feeder(feedFrame);
    hidden = true;
    feed(128, 30);
    expect(frameActivityState).toMatchObject({ mode: 'background', reason: 'hidden' });
    expect(animation.animationPreference.effective).toBe(false);
  });

  it('stopFrames clears a paused reason once the map is gone', async () => {
    const { feedFrame, stopFrames, frameActivityState } = await load();
    focused = false;
    feeder(feedFrame)(60, 1);
    expect(frameActivityState.reason).toBe('unfocused');
    stopFrames();
    expect(frameActivityState).toMatchObject({ mode: 'active', reason: null });
  });

  it('a forced animation setting lets resolution move freely', async () => {
    const { feedFrame, animation, resolution } = await load();
    animation.animationPreference.setting = 'off';
    const feed = feeder(feedFrame);
    feed(128, 10);
    expect(resolution.resolutionPreference.effective).toBe(1.5);
    feed(128, 10);
    expect(resolution.resolutionPreference.effective).toBe(2);
    feed(20, 5);
    expect(resolution.resolutionPreference.effective).toBe(1.5);
  });

  it('resolution waits while animations still have a normal or retry step ahead', async () => {
    const { feedFrame, animation, resolution } = await load();
    const feed = feeder(feedFrame);
    feed(128, 10);
    feed(20, 5);
    expect(animation.animationPreference.reason).toBe('auto-off-slow');
    // 45 fps: not enough for the animation retry; resolution must not climb past the wait either.
    feed(40, 60);
    expect(animation.animationPreference.effective).toBe(false);
    expect(resolution.resolutionPreference.effective).toBe(1);
  });

  it('a level change resets the other governor', async () => {
    const { feedFrame, animation, resolution } = await load();
    const feed = feeder(feedFrame);
    feed(128, 10);
    expect(animation.animationGovernor.getLevel()).toBe(1);
    feed(128, 6);
    expect(resolution.resolutionPreference.progress.goodMs).toBe(6000);
    // Resolution climbs after 10 s; the animation window above is already full-width,
    // so force an animation drop through a slow stretch and watch the resolution window restart.
    feed(20, 5);
    expect(animation.animationGovernor.getLevel()).toBe(0);
    expect(resolution.resolutionPreference.progress.goodMs).toBe(0);
  });
});

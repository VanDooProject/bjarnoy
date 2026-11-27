// @vitest-environment jsdom
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animationPreference } from '../lib/perf/animationPreference';
import { useAnimationClock } from './useAnimationClock';

// The device's reduce-motion flag as animationPreference reads it (its own live, cached media query),
// stubbed reactively so a flip while a page is open can be tested too.
const deviceReduced = ref(false);
const realReducedMotion = Object.getOwnPropertyDescriptor(animationPreference, 'reducedMotion')!;

function mockMatchMedia(reduced: boolean): void {
  deviceReduced.value = reduced;
}

function mountClock(): { wrapper: ReturnType<typeof mount>; now: Ref<number> } {
  let now!: Ref<number>;
  const Host = defineComponent({
    setup() {
      now = useAnimationClock();
      return () => h('div');
    },
  });
  return { wrapper: mount(Host), now };
}

describe('useAnimationClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(animationPreference, 'reducedMotion', { get: () => deviceReduced.value, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    animationPreference.setting = 'auto';
    Object.defineProperty(animationPreference, 'reducedMotion', realReducedMotion);
  });

  it('advances `now` from 0 as frames pass', () => {
    mockMatchMedia(false);
    const { wrapper, now } = mountClock();
    expect(now.value).toBe(0);
    vi.advanceTimersByTime(500);
    expect(now.value).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('stops advancing once unmounted', () => {
    mockMatchMedia(false);
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(200);
    const before = now.value;
    wrapper.unmount();
    vi.advanceTimersByTime(500);
    expect(now.value).toBe(before);
  });

  it('never ticks under prefers-reduced-motion, staying at frame 0', () => {
    mockMatchMedia(true);
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(2000);
    expect(now.value).toBe(0);
    wrapper.unmount();
  });

  it("never ticks when the setting is explicitly 'off', even without reduced-motion", () => {
    mockMatchMedia(false);
    animationPreference.setting = 'off';
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(2000);
    expect(now.value).toBe(0);
    wrapper.unmount();
  });

  it("ticks when the setting is explicitly 'on', even under reduced-motion", () => {
    mockMatchMedia(true);
    animationPreference.setting = 'on';
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(500);
    expect(now.value).toBeGreaterThan(0);
    wrapper.unmount();
  });

  // Regression: a visitor without an account can only switch animations on from the docs page
  // itself (AnimationPausedNote); the clock used to read the setting once, on mount.
  it("starts ticking when the setting is switched to 'on' after mount, and stops again on 'off'", async () => {
    mockMatchMedia(true);
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(1000);
    expect(now.value).toBe(0);

    animationPreference.setting = 'on';
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(now.value).toBeGreaterThan(0);

    animationPreference.setting = 'off';
    await nextTick();
    const stopped = now.value;
    vi.advanceTimersByTime(500);
    expect(now.value).toBe(stopped);
    wrapper.unmount();
  });

  // Regression: the clock used to query `prefers-reduced-motion` itself, once at mount, instead of
  // the resolved building-animation setting, so a device flag flip on 'auto' never reached it.
  it("follows the device's reduce-motion flag live while the setting is 'auto'", async () => {
    mockMatchMedia(false);
    const { wrapper, now } = mountClock();
    vi.advanceTimersByTime(500);
    expect(now.value).toBeGreaterThan(0);

    mockMatchMedia(true);
    await nextTick();
    const held = now.value;
    vi.advanceTimersByTime(500);
    expect(now.value).toBe(held);

    mockMatchMedia(false);
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(now.value).toBeGreaterThan(held);
    wrapper.unmount();
  });
});

// @vitest-environment jsdom
import { defineComponent, h, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimationClock } from './useAnimationClock';

function mockMatchMedia(reduced: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
});

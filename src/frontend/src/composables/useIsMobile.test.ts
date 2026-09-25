// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_MAX_WIDTH, useIsMobile } from './useIsMobile';

// jsdom has no real matchMedia implementation, so stub one that tracks its
// listeners and lets a test flip `matches` and fire a synthetic change —
// mirrors the fake-timer/synthetic-event shape used elsewhere in this repo
// (see useActivityHeartbeat.test.ts's setVisibility()).
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const state = { matches: initialMatches };
  const mql = {
    get matches() {
      return state.matches;
    },
    media: `(max-width: ${MOBILE_MAX_WIDTH}px)`,
    addEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  window.matchMedia = vi.fn().mockReturnValue(mql);

  return {
    fireChange(matches: boolean) {
      state.matches = matches;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

let wrappers: ReturnType<typeof mount>[] = [];

function mountIsMobile() {
  let isMobile!: ReturnType<typeof useIsMobile>;
  const wrapper = mount(
    defineComponent({
      setup() {
        isMobile = useIsMobile();
        return () => h('div');
      },
    }),
  );
  wrappers.push(wrapper);
  return { wrapper, isMobile };
}

beforeEach(() => {
  wrappers = [];
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
});

describe('useIsMobile', () => {
  it('reflects the initial matchMedia result', () => {
    stubMatchMedia(true);
    const { isMobile } = mountIsMobile();
    expect(isMobile.value).toBe(true);
  });

  it('flips when the media query change fires', () => {
    const media = stubMatchMedia(false);
    const { isMobile } = mountIsMobile();
    expect(isMobile.value).toBe(false);

    media.fireChange(true);
    expect(isMobile.value).toBe(true);

    media.fireChange(false);
    expect(isMobile.value).toBe(false);
  });

  it('unsubscribes its change listener on unmount', () => {
    const media = stubMatchMedia(false);
    const { wrapper } = mountIsMobile();
    expect(media.listenerCount()).toBe(1);

    wrapper.unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('falls back to false when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    // @ts-expect-error simulating an environment without matchMedia
    delete window.matchMedia;

    const { isMobile } = mountIsMobile();
    expect(isMobile.value).toBe(false);

    window.matchMedia = original;
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useMediaQuery } from './useMediaQuery';

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return {
    fire(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

function mountProbe(query: string) {
  let result: ReturnType<typeof useMediaQuery>;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useMediaQuery(query);
        return () => h('div');
      },
    }),
  );
  return { wrapper, get matches() { return result!.value; } };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to false when window.matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { matches, wrapper } = mountProbe('(max-width: 768px)');
    expect(matches).toBe(false);
    wrapper.unmount();
  });

  it('reflects the initial match state', () => {
    stubMatchMedia(true);
    const { matches, wrapper } = mountProbe('(max-width: 768px)');
    expect(matches).toBe(true);
    wrapper.unmount();
  });

  it('updates reactively when the media query changes', async () => {
    const stub = stubMatchMedia(false);
    const probe = mountProbe('(max-width: 768px)');
    stub.fire(true);
    expect(probe.matches).toBe(true);
    stub.fire(false);
    expect(probe.matches).toBe(false);
    probe.wrapper.unmount();
  });

  it('removes its listener on unmount', () => {
    const stub = stubMatchMedia(false);
    const { wrapper } = mountProbe('(max-width: 768px)');
    expect(stub.listenerCount()).toBe(1);
    wrapper.unmount();
    expect(stub.listenerCount()).toBe(0);
  });
});

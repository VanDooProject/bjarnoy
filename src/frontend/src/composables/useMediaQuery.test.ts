// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  window.matchMedia = () => mql as unknown as MediaQueryList;
  return {
    fire(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

const HostComponent = defineComponent({
  setup() {
    const matches = useMediaQuery('(min-width: 700px)');
    return () => h('div', String(matches.value));
  },
});

let wrappers: ReturnType<typeof mount>[] = [];

afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  wrappers = [];
});

describe('useMediaQuery', () => {
  it('reflects the query\'s initial match state', () => {
    mockMatchMedia(true);
    const wrapper = mount(HostComponent);
    wrappers.push(wrapper);

    expect(wrapper.text()).toBe('true');
  });

  it('updates reactively when the query starts matching', async () => {
    const control = mockMatchMedia(false);
    const wrapper = mount(HostComponent);
    wrappers.push(wrapper);
    expect(wrapper.text()).toBe('false');

    control.fire(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toBe('true');
  });

  it('removes its listener on unmount', () => {
    const control = mockMatchMedia(false);
    const wrapper = mount(HostComponent);
    expect(control.listenerCount()).toBe(1);

    wrapper.unmount();

    expect(control.listenerCount()).toBe(0);
  });
});

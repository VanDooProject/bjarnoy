// @vitest-environment jsdom
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapAnchor } from './useMapAnchor';
import type { AxialCoord } from '../lib/hex/coords';

function mountAnchor(getRenderer: () => { hexCenterScreen: (c: AxialCoord) => { x: number; y: number } } | null, getCoord: () => AxialCoord | null) {
  const el = ref<HTMLElement | null>(null);
  const Host = defineComponent({
    setup() {
      useMapAnchor(el, getRenderer, getCoord);
      return () => h('div', { ref: el });
    },
  });
  return { wrapper: mount(Host), el };
}

describe('useMapAnchor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes --anchor-x/--anchor-y from the renderer's hexCenterScreen every frame", () => {
    const coord = { q: 1, r: 2 };
    const hexCenterScreen = vi.fn(() => ({ x: 10, y: 20 }));
    const { wrapper, el } = mountAnchor(() => ({ hexCenterScreen }), () => coord);

    vi.advanceTimersByTime(50);

    expect(hexCenterScreen).toHaveBeenCalledWith(coord);
    expect(el.value?.style.getPropertyValue('--anchor-x')).toBe('10px');
    expect(el.value?.style.getPropertyValue('--anchor-y')).toBe('20px');
    wrapper.unmount();
  });

  it('follows a coord/renderer that change over time, since both are re-read every frame', () => {
    let coord: AxialCoord | null = { q: 0, r: 0 };
    const hexCenterScreen = vi.fn((c: AxialCoord) => ({ x: c.q * 100, y: c.r * 100 }));
    const { wrapper, el } = mountAnchor(() => ({ hexCenterScreen }), () => coord);

    vi.advanceTimersByTime(20);
    expect(el.value?.style.getPropertyValue('--anchor-x')).toBe('0px');

    coord = { q: 3, r: 0 };
    vi.advanceTimersByTime(20);
    expect(el.value?.style.getPropertyValue('--anchor-x')).toBe('300px');
    wrapper.unmount();
  });

  it('does nothing (no throw, no write) when there is no renderer or no coord yet', () => {
    const { wrapper, el } = mountAnchor(() => null, () => null);
    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
    expect(el.value?.style.getPropertyValue('--anchor-x')).toBe('');
    wrapper.unmount();
  });

  it('stops scheduling frames once unmounted', () => {
    const hexCenterScreen = vi.fn(() => ({ x: 1, y: 1 }));
    const { wrapper, el } = mountAnchor(() => ({ hexCenterScreen }), () => ({ q: 0, r: 0 }));
    vi.advanceTimersByTime(20);
    const callsBeforeUnmount = hexCenterScreen.mock.calls.length;

    wrapper.unmount();
    vi.advanceTimersByTime(200);

    expect(hexCenterScreen.mock.calls.length).toBe(callsBeforeUnmount);
    void el;
  });
});

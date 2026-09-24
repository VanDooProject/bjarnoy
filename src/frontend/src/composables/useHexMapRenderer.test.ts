// @vitest-environment jsdom
//
// useHexMapRenderer's `ready`/`loadError` are the loading-indicator signal
// SettlementCanvas.vue's overlay is driven by (see its own test) — mocked
// here against a fake HexMapRenderer whose mount() we control directly,
// since a real one needs a real canvas/Pixi context this repo's test
// environment doesn't provide.
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHexMapRenderer } from './useHexMapRenderer';

const mountMock = vi.fn();
const destroyMock = vi.fn();

// jsdom has no ResizeObserver — stubbed so mount()'s success path (which
// wires one up right after `ready` flips) doesn't throw once mount resolves.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

vi.mock('../lib/map/HexMapRenderer', () => ({
  // A plain function (not an arrow) so `new HexMapRenderer(...)` works —
  // vi.fn().mockImplementation(() => ({...})) can't be used with `new`.
  HexMapRenderer: vi.fn().mockImplementation(function (this: { mount: unknown; destroy: unknown; resize: unknown }) {
    this.mount = mountMock;
    this.destroy = destroyMock;
    this.resize = vi.fn();
  }),
}));

// A tiny host component, since the composable relies on onMounted/
// onBeforeUnmount lifecycle hooks that only fire inside a real component.
function makeHost() {
  return defineComponent({
    setup() {
      const canvas = { value: document.createElement('canvas') } as any;
      const container = { value: document.createElement('div') } as any;
      // jsdom's getBoundingClientRect defaults to all-zero, which would spin
      // useHexMapRenderer's waitForRealSize loop for its full 10 rAF frames
      // every test — stub a real size so it resolves on the first check.
      container.value.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
      const state = useHexMapRenderer(canvas, container, {
        mode: 'settlement',
        worldModel: {} as any,
        playerId: 'p1',
      });
      return () => h('div', [state.ready.value ? 'ready' : 'loading', state.loadError.value ? 'error' : '']);
    },
  });
}

describe('useHexMapRenderer', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stays not-ready until mount() resolves, then flips ready with no error', async () => {
    let resolveMount!: () => void;
    mountMock.mockReturnValue(new Promise<void>((resolve) => (resolveMount = resolve)));

    const wrapper = mount(makeHost());
    await nextTick();
    expect(wrapper.text()).toContain('loading');

    resolveMount();
    // mount()'s await plus the onMounted async fn's own continuation need a
    // couple of microtask turns to settle.
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain('ready');
    expect(wrapper.text()).not.toContain('error');
    wrapper.unmount();
  });

  it('sets loadError and destroys the half-built renderer when mount() rejects', async () => {
    const err = new Error('atlas failed to load');
    mountMock.mockRejectedValue(err);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(makeHost());
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain('loading');
    expect(wrapper.text()).toContain('error');
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    wrapper.unmount();
  });
});

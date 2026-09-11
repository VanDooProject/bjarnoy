// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import GuidancePointer from './GuidancePointer.vue';

describe('GuidancePointer', () => {
  it('renders the given label and applies the rotation angle', () => {
    const wrapper = mount(GuidancePointer, {
      props: {
        coord: { q: 1, r: 0 },
        renderer: { hexCenterScreen: vi.fn(() => ({ x: 5, y: 5 })) },
        label: 'Click this plot',
        angle: 52,
      },
    });
    expect(wrapper.text()).toContain('Click this plot');
    expect(wrapper.get('.anchor').attributes('style')).toContain('--rotate: 52deg');
    wrapper.unmount();
  });

  it('defaults the label chip to the left side', () => {
    const wrapper = mount(GuidancePointer, {
      props: { coord: { q: 0, r: 0 }, renderer: null, label: 'Now build here' },
    });
    expect(wrapper.get('.chip').classes()).toContain('left');
    wrapper.unmount();
  });

  it('does not throw when mounted with no renderer yet (async canvas mount)', () => {
    expect(() =>
      mount(GuidancePointer, { props: { coord: { q: 0, r: 0 }, renderer: undefined, label: 'x' } }).unmount(),
    ).not.toThrow();
  });

  // Frame 3: aimed at a fixed ring-bubble screen spot instead of a hex.
  it('anchors to a fixed screen point when given one instead of a hex', async () => {
    const wrapper = mount(GuidancePointer, {
      props: { screen: { x: 123, y: 456 }, label: 'This one fits Grassland' },
    });
    // The write is a watchEffect keyed off the template ref becoming
    // available, which (unlike a plain prop change) flushes on the next
    // tick rather than synchronously within mount().
    await wrapper.vm.$nextTick();
    const style = wrapper.get('.anchor').attributes('style') ?? '';
    expect(style).toContain('--anchor-x: 123px');
    expect(style).toContain('--anchor-y: 456px');
    wrapper.unmount();
  });
});

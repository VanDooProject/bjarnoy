// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BuildRefusalChip from './BuildRefusalChip.vue';

describe('BuildRefusalChip', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the server message as a status chip', () => {
    const wrapper = mount(BuildRefusalChip, {
      props: { renderer: null, coord: { q: 1, r: 2 }, message: 'No free construction slot.' },
    });
    expect(wrapper.get('[data-testid="build-refusal"]').text()).toBe('No free construction slot.');
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('pins itself under the hex it is about, following the renderer', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    const hexCenterScreen = vi.fn(() => ({ x: 320, y: 210 }));
    const wrapper = mount(BuildRefusalChip, {
      props: { renderer: { hexCenterScreen }, coord: { q: 1, r: 2 }, message: 'Nope' },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(hexCenterScreen).toHaveBeenCalledWith({ q: 1, r: 2 });
    const el = wrapper.get('.refusal-chip').element as HTMLElement;
    expect(el.style.getPropertyValue('--anchor-x')).toBe('320px');
    expect(el.style.getPropertyValue('--anchor-y')).toBe('210px');
    wrapper.unmount();
  });
});

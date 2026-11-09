// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HudNavLink from './HudNavLink.vue';
function mountLink() {
    return mount(HudNavLink, { props: { href: '/leaderboards' }, slots: { default: 'Leaderboards' } });
}
function click(wrapper, init = {}) {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    wrapper.element.dispatchEvent(event);
    return event;
}
describe('HudNavLink', () => {
    it('renders an anchor with the href and the slot', () => {
        const wrapper = mountLink();
        expect(wrapper.element.tagName).toBe('A');
        expect(wrapper.attributes('href')).toBe('/leaderboards');
        expect(wrapper.text()).toBe('Leaderboards');
    });
    it('a plain left click emits navigate and stops the browser following the href', () => {
        const wrapper = mountLink();
        const event = click(wrapper);
        expect(wrapper.emitted('navigate')).toHaveLength(1);
        expect(event.defaultPrevented).toBe(true);
    });
    it.each([
        ['ctrl', { ctrlKey: true }],
        ['meta', { metaKey: true }],
        ['shift', { shiftKey: true }],
        ['alt', { altKey: true }],
        ['middle button', { button: 1 }],
    ])('a %s click is left to the browser: no navigate, not prevented', (_name, init) => {
        const wrapper = mountLink();
        const event = click(wrapper, init);
        expect(wrapper.emitted('navigate')).toBeUndefined();
        expect(event.defaultPrevented).toBe(false);
    });
});

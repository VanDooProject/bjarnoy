// @vitest-environment jsdom
//
// TopBar started as the settlement/world-map overlay, deriving its title and
// caption from the world store and floating over the map canvas. The docs
// pages reuse the same chrome without either: they name the bar themselves
// and sit in a scrolling document. These tests pin both shapes, so the
// map-overlay defaults can't drift while the docked variant is worked on.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from './TopBar.vue';
import { useWorldStore } from '../../stores/world';

describe('TopBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders nothing but the logo when there is no settlement and no title', () => {
    const wrapper = mount(TopBar);

    expect(wrapper.find('.titles').exists()).toBe(false);
    expect(wrapper.find('.logo-hex').exists()).toBe(true);
    wrapper.unmount();
  });

  it('names the settlement and its island/longhouse caption from the world store', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';
    world.hud.level = 4;

    const wrapper = mount(TopBar);

    expect(wrapper.get('.name').text()).toBe('Unnamed realm');
    expect(wrapper.get('.caption').text()).toBe('LONGHOUSE 4');
    wrapper.unmount();
  });

  it('lets a caller name the bar, overriding the settlement', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';

    const wrapper = mount(TopBar, { props: { title: 'Tech tree', caption: 'DOCS · DEPENDENCIES' } });

    expect(wrapper.get('.name').text()).toBe('Tech tree');
    expect(wrapper.get('.caption').text()).toBe('DOCS · DEPENDENCIES');
    wrapper.unmount();
  });

  it('shows no longhouse caption for a titled bar that asked for none', () => {
    const world = useWorldStore();
    world.hud.level = 7;

    const wrapper = mount(TopBar, { props: { title: 'Docs' } });

    expect(wrapper.get('.name').text()).toBe('Docs');
    expect(wrapper.find('.caption').exists()).toBe(false);
    wrapper.unmount();
  });

  it('is a floating map overlay by default and a docked page header on request', () => {
    const floating = mount(TopBar);
    expect(floating.get('.hud-bar').classes()).not.toContain('hud-bar--docked');
    floating.unmount();

    const docked = mount(TopBar, { props: { docked: true } });
    expect(docked.get('.hud-bar').classes()).toContain('hud-bar--docked');
    docked.unmount();
  });
});

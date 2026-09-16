// @vitest-environment jsdom
//
// TopBar started as the settlement/world-map overlay, deriving its title and
// caption from the world store and floating over the map canvas. The docs
// pages reuse the same chrome without either: they name the bar themselves
// and sit in a scrolling document. These tests pin both shapes, so the
// map-overlay defaults can't drift while the docked variant is worked on.
//
// The mobile pull-down drawer/grip only ever appears under the compact media
// query and never when docked — several tests below pin the "desktop stays
// completely untouched" guarantee explicitly, per the product owner's
// requirement that this feature never changes anything outside mobile.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from './TopBar.vue';
import { useWorldStore } from '../../stores/world';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

function mountTopBar(props?: Record<string, unknown>) {
  return mount(TopBar, {
    props,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

function stubCompactMediaQuery(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

describe('TopBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  it('renders nothing but the logo when there is no settlement and no title', () => {
    const wrapper = mountTopBar();

    expect(wrapper.find('.titles').exists()).toBe(false);
    expect(wrapper.find('.logo-hex').exists()).toBe(true);
    wrapper.unmount();
  });

  it('names the settlement and its island/longhouse caption from the world store', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';
    world.hud.level = 4;

    const wrapper = mountTopBar();

    expect(wrapper.get('.name').text()).toBe('Unnamed realm');
    expect(wrapper.get('.caption').text()).toBe('LONGHOUSE 4');
    wrapper.unmount();
  });

  it('lets a caller name the bar, overriding the settlement', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';

    const wrapper = mountTopBar({ title: 'Tech tree', caption: 'DOCS · DEPENDENCIES' });

    expect(wrapper.get('.name').text()).toBe('Tech tree');
    expect(wrapper.get('.caption').text()).toBe('DOCS · DEPENDENCIES');
    wrapper.unmount();
  });

  it('shows no longhouse caption for a titled bar that asked for none', () => {
    const world = useWorldStore();
    world.hud.level = 7;

    const wrapper = mountTopBar({ title: 'Docs' });

    expect(wrapper.get('.name').text()).toBe('Docs');
    expect(wrapper.find('.caption').exists()).toBe(false);
    wrapper.unmount();
  });

  it('is a floating map overlay by default and a docked page header on request', () => {
    const floating = mountTopBar();
    expect(floating.get('.hud-bar').classes()).not.toContain('hud-bar--docked');
    floating.unmount();

    const docked = mountTopBar({ docked: true });
    expect(docked.get('.hud-bar').classes()).toContain('hud-bar--docked');
    docked.unmount();
  });

  describe('desktop (compact media query not matched)', () => {
    it('renders no grip and no drawer DOM at all', () => {
      const wrapper = mountTopBar();

      expect(wrapper.find('.hud-grip').exists()).toBe(false);
      expect(wrapper.find('.hud-drawer').exists()).toBe(false);
      expect(wrapper.find('.hud-drawer-backdrop').exists()).toBe(false);
      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--drag-enabled');
      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--bottom');
      wrapper.unmount();
    });
  });

  describe('mobile (compact media query matched)', () => {
    beforeEach(() => {
      stubCompactMediaQuery(true);
    });

    it('renders the grip and drawer once compact and not docked', async () => {
      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-grip').exists()).toBe(true);
      expect(wrapper.find('.hud-drawer').exists()).toBe(true);
      expect(wrapper.get('.hud-bar').classes()).toContain('hud-bar--drag-enabled');
      wrapper.unmount();
    });

    it('never renders the grip/drawer when docked, even if compact', async () => {
      const wrapper = mountTopBar({ docked: true });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-grip').exists()).toBe(false);
      expect(wrapper.find('.hud-drawer').exists()).toBe(false);
      wrapper.unmount();
    });

    it('follows the hudPrefs position — bottom docking applies the bottom class', async () => {
      const prefs = useHudPrefsStore();
      prefs.setBarPosition('bottom');

      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).toContain('hud-bar--bottom');
      wrapper.unmount();
    });

    it('a tap on the grip toggles the drawer open and closed', async () => {
      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      const grip = wrapper.get('.hud-grip');
      expect(grip.attributes('aria-expanded')).toBe('false');

      await grip.trigger('click');
      expect(grip.attributes('aria-expanded')).toBe('true');

      await grip.trigger('click');
      expect(grip.attributes('aria-expanded')).toBe('false');
      wrapper.unmount();
    });

    it('keeps the shared isHudDrawerOpen flag in sync, and clears it on unmount', async () => {
      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      expect(isHudDrawerOpen.value).toBe(false);
      await wrapper.get('.hud-grip').trigger('click');
      expect(isHudDrawerOpen.value).toBe(true);

      wrapper.unmount();
      expect(isHudDrawerOpen.value).toBe(false);
    });
  });
});

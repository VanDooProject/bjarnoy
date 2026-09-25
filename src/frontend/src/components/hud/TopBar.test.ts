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

function mountTopBar(props?: Record<string, unknown>, slots?: Record<string, string>) {
  return mount(TopBar, {
    props,
    slots,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

// Finding #9: the grip/drag/drawer trio only ever appears when the caller
// actually gives TopBar a `#drawer` slot (`useSlots` in TopBar.vue) — every
// mobile test below that expects a grip mounts with this, matching how every
// real caller (MapView.vue, the docs views, LandingView.vue post-founding)
// does it now.
const DRAWER_SLOT = { drawer: '<div class="fake-drawer-content" />' };

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

    it('renders the grip and drawer once compact and a drawer slot is given', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-grip').exists()).toBe(true);
      expect(wrapper.find('.hud-drawer').exists()).toBe(true);
      expect(wrapper.get('.hud-bar').classes()).toContain('hud-bar--drag-enabled');
      wrapper.unmount();
    });

    // Finding #9: a bare `<TopBar>` with nothing to put in the drawer (the
    // pre-founding landing page: just a locale switcher and "I already have
    // a realm") must not get a grip that opens an empty sheet.
    it('never renders the grip/drawer without a drawer slot, even if compact', async () => {
      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-grip').exists()).toBe(false);
      expect(wrapper.find('.hud-drawer').exists()).toBe(false);
      wrapper.unmount();
    });

    // Finding #8: `docked` no longer gates the grip/drawer at all — every
    // docs page passes a `#drawer` slot of its own now (MobileHudDrawer),
    // and gets the same grip a map view does.
    it('renders the grip/drawer when docked too, as long as a drawer slot is given', async () => {
      const wrapper = mountTopBar({ docked: true }, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-grip').exists()).toBe(true);
      expect(wrapper.find('.hud-drawer').exists()).toBe(true);
      wrapper.unmount();
    });

    it('follows the hudPrefs position — bottom docking applies the bottom class', async () => {
      const prefs = useHudPrefsStore();
      prefs.setBarPosition('bottom');

      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).toContain('hud-bar--bottom');
      wrapper.unmount();
    });

    // Finding #12: a docked bar is a sticky in-flow header, not a map
    // overlay with a top/bottom preference of its own — it always docks
    // 'top' regardless of the global map bar's preference.
    it('ignores the hudPrefs bottom preference when docked', async () => {
      const prefs = useHudPrefsStore();
      prefs.setBarPosition('bottom');

      const wrapper = mountTopBar({ docked: true }, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--bottom');
      wrapper.unmount();
    });

    it('a tap on the grip toggles the drawer open and closed', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
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
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(isHudDrawerOpen.value).toBe(false);
      await wrapper.get('.hud-grip').trigger('click');
      expect(isHudDrawerOpen.value).toBe(true);

      wrapper.unmount();
      expect(isHudDrawerOpen.value).toBe(false);
    });

    // Finding #19: the closed drawer's content must not stay focusable/
    // announced — same `inert`/`aria-hidden` pattern QueueDrawer.vue already
    // uses for its own closed panel — and the grip points `aria-controls`
    // at it by id.
    it('marks the closed drawer content inert/aria-hidden, and clears both once open', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      const content = wrapper.get('.hud-drawer-content');
      expect(content.attributes('aria-hidden')).toBe('true');
      // jsdom has no `HTMLElement.inert` IDL property, so Vue can't set it
      // as the real boolean DOM property a browser would (which is what
      // actually makes it inert/un-tabbable there) — it falls back to a
      // plain string attribute here, which is a test-environment ceiling,
      // not something this test can see past. The binding itself
      // (`:inert="!drawer.isOpen.value"`) is the same pattern
      // QueueDrawer.vue already ships with in production.
      expect(content.attributes('inert')).toBe('true');

      const grip = wrapper.get('.hud-grip');
      expect(grip.attributes('aria-controls')).toBe(content.attributes('id'));

      await grip.trigger('click');
      expect(content.attributes('aria-hidden')).toBe('false');
      expect(content.attributes('inert')).toBe('false');
      wrapper.unmount();
    });

    it('shows a settlement bubble instead of the inline title, ignoring hideTitle', async () => {
      const world = useWorldStore();
      world.hud.settlementName = 'Bjørnstad';
      world.hud.level = 4;
      world.hud.claimedHexes = 19;

      const wrapper = mountTopBar({ hideTitle: true });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.titles').exists()).toBe(false); // inline title stays hidden on mobile
      const bubble = wrapper.get('.settlement-bubble');
      expect(bubble.get('.bubble-name').text()).toBe('Bjørnstad');
      expect(bubble.get('.bubble-meta').text()).toBe('Lv 4 · 19 hexes');
      wrapper.unmount();
    });

    it('renders no settlement bubble when there is no settlement', async () => {
      const wrapper = mountTopBar();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.settlement-bubble').exists()).toBe(false);
      wrapper.unmount();
    });
  });
});

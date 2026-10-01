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
import { isHudBarAtBottom, isHudRail } from '../../composables/hudSettlementBubbleState';
import { hudBarHeightPx, hudRailHeightPx, hudRailWidthPx } from '../../composables/hudBarHeight';
import { HUD_COMPACT_QUERY, HUD_RAIL_QUERY } from '../../lib/breakpoints';
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

// Answers per query, like a real browser: the compact query and the landscape
// rail query are separate facts (a portrait phone is compact but not rail).
function stubMediaQueries(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matching.includes(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}
function stubCompactMediaQuery(matches: boolean) {
  stubMediaQueries(matches ? [HUD_COMPACT_QUERY] : []);
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
  // Landscape rail: a phone held sideways is compact AND short-landscape —
  // the full-width bar becomes a floating column and the drawer a side sheet.
  describe('landscape rail (compact + rail media queries matched)', () => {
    beforeEach(() => {
      stubMediaQueries([HUD_COMPACT_QUERY, HUD_RAIL_QUERY]);
    });

    it('applies the rail class when both queries match and a drawer slot exists', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).toContain('hud-bar--rail');
      expect(wrapper.get('.hud-drawer').classes()).toContain('hud-drawer--rail');
      expect(isHudRail.value).toBe(true);
      // The toggle keeps its identity: the first thing in the rail, still `.hud-grip`.
      const grip = wrapper.get('.hud-grip');
      expect(grip.attributes('aria-controls')).toBeTruthy();
      expect(grip.attributes('aria-expanded')).toBe('false');
      wrapper.unmount();
      expect(isHudRail.value).toBe(false);
    });

    it('does not apply to a bar without a drawer slot (the pre-founding landing bar)', async () => {
      const wrapper = mountTopBar({ title: 'Bjarnoy' });
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--rail');
      expect(isHudRail.value).toBe(false);
      wrapper.unmount();
    });

    it('does not apply to a docked header', async () => {
      const wrapper = mountTopBar({ docked: true }, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--rail');
      expect(isHudRail.value).toBe(false);
      wrapper.unmount();
    });

    it('does not apply to a portrait phone (compact, but not short-landscape)', async () => {
      stubMediaQueries([HUD_COMPACT_QUERY]);
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--rail');
      expect(wrapper.get('.hud-drawer').classes()).not.toContain('hud-drawer--rail');
      wrapper.unmount();
    });

    it('does not apply on desktop even if the rail query alone matches', async () => {
      stubMediaQueries([HUD_RAIL_QUERY]);
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.hud-bar--rail').exists()).toBe(false);
      expect(wrapper.find('.hud-grip').exists()).toBe(false);
      wrapper.unmount();
    });

    it('ignores the bottom docking preference and publishes no top band', async () => {
      useHudPrefsStore().setBarPosition('bottom');
      hudBarHeightPx.value = 64;
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-bar').classes()).not.toContain('hud-bar--bottom');
      expect(wrapper.get('.hud-drawer').classes()).not.toContain('hud-drawer--bottom');
      expect(isHudBarAtBottom.value).toBe(false);
      expect(hudBarHeightPx.value).toBe(0);
      wrapper.unmount();
      expect(hudRailWidthPx.value).toBe(0);
      expect(hudRailHeightPx.value).toBe(0);
    });

    it('the grip toggles the side sheet, which slides in from the left', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      const drawer = wrapper.get('.hud-drawer');
      expect(drawer.attributes('style')).toContain('translateX(-100%)');

      await wrapper.get('.hud-grip').trigger('click');
      expect(wrapper.get('.hud-grip').attributes('aria-expanded')).toBe('true');
      expect(drawer.attributes('style')).toContain('translateX(0)');
      expect(drawer.classes()).toContain('hud-drawer--rail-open');
      expect(isHudDrawerOpen.value).toBe(true);

      await wrapper.get('.hud-grip').trigger('click');
      expect(drawer.attributes('style')).toContain('translateX(-100%)');
      wrapper.unmount();
    });

    it('closes on Escape and on a backdrop tap', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      await wrapper.get('.hud-grip').trigger('click');
      expect(wrapper.get('.hud-drawer-backdrop').attributes('style')).toContain('opacity: 0.6');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await wrapper.vm.$nextTick();
      expect(wrapper.get('.hud-grip').attributes('aria-expanded')).toBe('false');

      await wrapper.get('.hud-grip').trigger('click');
      await wrapper.get('.hud-drawer-backdrop').trigger('click');
      expect(wrapper.get('.hud-grip').attributes('aria-expanded')).toBe('false');
      wrapper.unmount();
    });

    it('has no drag gesture: a pull on the bar never opens the drawer', async () => {
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();

      // jsdom's MouseEvent has getter-only coordinates, so build plain events.
      const fire = (type: string, clientY: number) =>
        wrapper.get('.hud-bar').element.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), { clientY, pointerId: 1, isPrimary: true, pointerType: 'touch' }),
        );
      fire('pointerdown', 10);
      fire('pointermove', 200);
      fire('pointerup', 200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.hud-grip').attributes('aria-expanded')).toBe('false');
      wrapper.unmount();
    });

    it('moves the settlement bubble to the top edge, right of the rail', async () => {
      const world = useWorldStore();
      world.hud.settlementName = 'Unnamed realm';
      hudRailWidthPx.value = 92;
      const wrapper = mountTopBar(undefined, DRAWER_SLOT);
      await wrapper.vm.$nextTick();
      // jsdom has no layout: the rail's measured width stays whatever it was
      // before the measurement (zeroed on unmount, set here for the first one).
      const bubble = wrapper.get('.settlement-bubble');
      expect(bubble.attributes('style')).toContain('top: 8px');
      expect(bubble.attributes('style')).toMatch(/left: \d+px/);
      wrapper.unmount();
    });
  });
});

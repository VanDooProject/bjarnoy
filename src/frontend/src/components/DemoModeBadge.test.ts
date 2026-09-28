// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DemoModeBadge from './DemoModeBadge.vue';
import { isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { isHudBarAtBottom, isHudBarMounted } from '../composables/hudSettlementBubbleState';
import { createTestI18n } from '../test/i18n';
import enDemoModeBadge from '../i18n/locales/en/demoModeBadge.json';

vi.mock('../config', () => ({ DEMO_MODE: true }));

function mountBadge() {
  return mount(DemoModeBadge, {
    global: { plugins: [createTestI18n({ demoModeBadge: enDemoModeBadge })] },
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

describe('DemoModeBadge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    // Mobile tutorial focus: every existing test here assumes a real TopBar
    // is mounted somewhere on the page (the normal case) — only the
    // dedicated "bar is unmounted" test below turns this off.
    isHudBarMounted.value = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    isHudDrawerOpen.value = false;
    isHudBarAtBottom.value = false;
    isHudBarMounted.value = false;
  });

  it('renders without the compact bubble class on desktop', () => {
    const wrapper = mountBadge();
    expect(wrapper.get('.demo-badge').classes()).not.toContain('demo-badge--compact');
    wrapper.unmount();
  });

  it('becomes a bubble positioned below a top-docked mobile bar', async () => {
    stubCompactMediaQuery(true);
    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    const badge = wrapper.get('.demo-badge');
    expect(badge.classes()).toContain('demo-badge--compact');
    expect(badge.attributes('style')).toContain('top: 72px');
    wrapper.unmount();
  });

  it('stays near the top when the bar is docked at the bottom instead', async () => {
    stubCompactMediaQuery(true);
    // Extra fix found while screenshotting finding #13: this reads TopBar's
    // own *effective* "am I actually rendered at the bottom edge" signal
    // (written by TopBar.vue) rather than the raw hudPrefs preference — a
    // bar that isn't drag/docking-aware at all (a docked page, or the
    // pre-founding landing bar) always sits at the top regardless of the
    // stored preference, so setting the preference alone here would no
    // longer reflect what any real page actually does with it.
    isHudBarAtBottom.value = true;

    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.demo-badge').attributes('style')).toContain('top: 8px');
    wrapper.unmount();
  });

  it('hides entirely while the mobile pull-down drawer is open', async () => {
    stubCompactMediaQuery(true);
    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.demo-badge').exists()).toBe(true);

    isHudDrawerOpen.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.demo-badge').exists()).toBe(false);

    isHudDrawerOpen.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.demo-badge').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ignores the drawer-open flag on desktop, where there is no drawer', async () => {
    isHudDrawerOpen.value = true; // stray state from a previous mobile view, say
    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.demo-badge').exists()).toBe(true);
    wrapper.unmount();
  });

  // Mobile tutorial focus: LandingView.vue unmounts its founded-branch
  // TopBar entirely on phones while the guided build steps run. TopBar's
  // own onBeforeUnmount resets `hudBarHeightPx` back to its 64px *default*,
  // not to 0, so without `isHudBarMounted` this badge would still park
  // itself 64px + 8px down, as if a default-height bar were still there.
  it('sits at the bare top edge, not a stale bar offset, once the bar is unmounted', async () => {
    stubCompactMediaQuery(true);
    isHudBarMounted.value = false;

    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.demo-badge').attributes('style')).toContain('top: 8px');
    wrapper.unmount();
  });
});

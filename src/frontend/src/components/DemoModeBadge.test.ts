// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DemoModeBadge from './DemoModeBadge.vue';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { isHudDrawerOpen } from '../composables/hudDrawerOpenState';
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    isHudDrawerOpen.value = false;
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
    const prefs = useHudPrefsStore();
    prefs.setBarPosition('bottom');

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
});

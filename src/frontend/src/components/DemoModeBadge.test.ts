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

  it('shows the full sentence on desktop', () => {
    const wrapper = mountBadge();
    expect(wrapper.get('.demo-badge').text()).toBe(enDemoModeBadge.label);
    wrapper.unmount();
  });

  it('shrinks to a short tag in the bottom-left corner on a phone', async () => {
    stubCompactMediaQuery(true);
    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    const badge = wrapper.get('.demo-badge');
    expect(badge.classes()).toContain('demo-badge--compact');
    expect(badge.text()).toBe(enDemoModeBadge.short);
    expect(badge.attributes('title')).toBe(enDemoModeBadge.title);
    expect(badge.attributes('style')).toContain('bottom: calc(2px');
    wrapper.unmount();
  });

  it('sits above the bar when the bar is docked at the bottom', async () => {
    stubCompactMediaQuery(true);
    isHudBarAtBottom.value = true;

    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.demo-badge').attributes('style')).toContain('bottom: calc(66px');
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

  // A bar that is unmounted (LandingView's tutorial focus) leaves a stale
  // 64px default in hudBarHeightPx — it must not lift the tag off the edge.
  it('ignores a stale bar height once the bar is unmounted', async () => {
    stubCompactMediaQuery(true);
    isHudBarAtBottom.value = true;
    isHudBarMounted.value = false;

    const wrapper = mountBadge();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.demo-badge').attributes('style')).toContain('bottom: calc(2px');
    wrapper.unmount();
  });
});

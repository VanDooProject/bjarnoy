// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHudPosition, useHudPositionPreference } from './useHudPosition';

const HostComponent = defineComponent({
  setup() {
    const position = useHudPosition();
    return () => h('div', position.value);
  },
});

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

let wrappers: ReturnType<typeof mount>[] = [];

async function mountHud(router: Router) {
  await router.push('/');
  const wrapper = mount(HostComponent, { global: { plugins: [router] } });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  useHudPositionPreference().setPreference('top');
});

afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  wrappers = [];
});

describe('useHudPosition', () => {
  it('defaults to top with no query param and nothing stored', async () => {
    const wrapper = await mountHud(testRouter());
    expect(wrapper.text()).toBe('top');
  });

  it('switches to bottom on ?hudPosition=bottom and remembers it in sessionStorage', async () => {
    const router = testRouter();
    const wrapper = await mountHud(router);

    await router.push('/?hudPosition=bottom');

    expect(wrapper.text()).toBe('bottom');
    expect(sessionStorage.getItem('fjordhold:hudPosition')).toBe('bottom');
  });

  it('survives navigating away to a query-less route, unlike a one-shot read', async () => {
    const router = testRouter();
    const wrapper = await mountHud(router);
    await router.push('/?hudPosition=bottom');

    await router.push('/');

    expect(wrapper.text()).toBe('bottom');
  });

  it('ignores an invalid hudPosition value', async () => {
    const router = testRouter();
    const wrapper = await mountHud(router);

    await router.push('/?hudPosition=sideways');

    expect(wrapper.text()).toBe('top');
  });

  it('falls back to the persistent preference when there is no session override', async () => {
    useHudPositionPreference().setPreference('bottom');

    const wrapper = await mountHud(testRouter());

    expect(wrapper.text()).toBe('bottom');
    expect(localStorage.getItem('fjordhold:hudPositionPref')).toBe('bottom');
  });

  it('lets a session override win over the persistent preference', async () => {
    useHudPositionPreference().setPreference('bottom');
    const router = testRouter();
    const wrapper = await mountHud(router);

    await router.push('/?hudPosition=top');

    expect(wrapper.text()).toBe('top');
  });
});
